import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4'
import {
  MAX_AVATAR_BYTES,
  MAX_TEMPLATE_BYTES,
  REGISTRATION_PROFILES,
  detectRegistrationProfile,
  generateRegistrationDocument,
  normalizeHandCode,
  type DocumentPlayer,
  type RegistrationProfileKey,
  type StaffFields
} from './logic.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'Content-Disposition, Content-Type'
}

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
})

const errorResponse = (error: unknown, fallback = '報名表處理失敗') => {
  if (error instanceof Response) return error
  console.error('registration-form-documents error:', error)
  return jsonResponse({ success: false, error: error instanceof Error ? error.message : fallback }, 500)
}

const requireString = (value: unknown, label: string) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw jsonResponse({ success: false, error: `${label}為必填` }, 400)
  return normalized
}

const getAuthenticatedContext = async (req: Request) => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw jsonResponse({ success: false, error: '缺少登入憑證' }, 401)
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw jsonResponse({ success: false, error: 'Edge Function 環境變數未設定完整' }, 500)
  }

  const { data, error } = await serviceClient.auth.getUser(token)
  if (error || !data.user?.id) throw jsonResponse({ success: false, error: '登入憑證無效' }, 401)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
  return { userId: data.user.id, userClient }
}

const assertPermission = async (client: SupabaseClient, feature: string, action: string) => {
  const { data, error } = await client.rpc('has_app_permission', { p_feature: feature, p_action: action })
  if (error) throw error
  if (data !== true) throw jsonResponse({ success: false, error: `缺少 ${feature}:${action} 權限` }, 403)
}

const safeFileName = (value: string) => value
  .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 180)

const handleUpload = async (req: Request, userId: string, userClient: SupabaseClient) => {
  await assertPermission(userClient, 'registration_forms', 'CREATE')
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw jsonResponse({ success: false, error: '請選擇範本檔案' }, 400)
  if (file.size > MAX_TEMPLATE_BYTES) throw jsonResponse({ success: false, error: '範本檔案不可超過 10 MB' }, 400)

  const originalFileNameField = form.get('original_file_name')
  const submittedFileName = (
    typeof originalFileNameField === 'string' && originalFileNameField.trim()
      ? originalFileNameField
      : file.name
  ).trim()
  const normalizedFileName = submittedFileName.normalize('NFKC')
  const dotIndex = normalizedFileName.lastIndexOf('.')
  const submittedExtension = dotIndex >= 0
    ? normalizedFileName.slice(dotIndex + 1).trim().toLowerCase()
    : ''
  if (submittedExtension && submittedExtension !== 'xlsx' && submittedExtension !== 'docx') {
    throw jsonResponse({ success: false, error: '只接受 .xlsx 或 .docx 範本' }, 400)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  let profile
  try {
    profile = detectRegistrationProfile(bytes)
  } catch (error) {
    throw jsonResponse({ success: false, error: error instanceof Error ? error.message : '尚未支援此報名表版型' }, 400)
  }
  if (submittedExtension && profile.fileType !== submittedExtension) {
    throw jsonResponse({ success: false, error: '副檔名與版型內容不一致' }, 400)
  }

  const extension = profile.fileType
  const sanitizedSubmittedFileName = safeFileName(submittedFileName)
  const originalFileName = submittedExtension
    ? sanitizedSubmittedFileName
    : `${sanitizedSubmittedFileName || 'template'}.${extension}`
  const displayName = safeFileName(String(form.get('display_name') || '')) || profile.label
  const storagePath = `${userId}/${crypto.randomUUID()}/template.${extension}`
  const contentType = extension === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  const { error: uploadError } = await serviceClient.storage
    .from('registration-forms')
    .upload(storagePath, bytes, { contentType, upsert: false })
  if (uploadError) throw uploadError

  const { data, error: insertError } = await serviceClient
    .from('registration_form_templates')
    .insert({
      name: displayName,
      original_file_name: originalFileName,
      file_type: profile.fileType,
      profile_key: profile.key,
      profile_version: profile.version,
      max_players: profile.maxPlayers,
      has_photo_slots: true,
      storage_path: storagePath,
      created_by: userId,
      updated_by: userId
    })
    .select('*')
    .single()

  if (insertError) {
    await serviceClient.storage.from('registration-forms').remove([storagePath])
    throw insertError
  }
  return jsonResponse({ success: true, template: data }, 201)
}

const parseJson = async (req: Request) => {
  try { return await req.json() } catch { throw jsonResponse({ success: false, error: '請求格式錯誤' }, 400) }
}

const getTemplate = async (templateId: string) => {
  const { data, error } = await serviceClient
    .from('registration_form_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  if (error || !data) throw jsonResponse({ success: false, error: '找不到報名表範本' }, 404)
  return data
}

const handleDelete = async (payload: any, userClient: SupabaseClient) => {
  await assertPermission(userClient, 'registration_forms', 'DELETE')
  const templateId = requireString(payload?.template_id, '範本')
  const template = await getTemplate(templateId)

  const { error: storageError } = await serviceClient.storage
    .from('registration-forms')
    .remove([template.storage_path])
  if (storageError) throw storageError

  const { error: deleteError } = await serviceClient
    .from('registration_form_templates')
    .delete()
    .eq('id', templateId)
  if (deleteError) throw deleteError
  return jsonResponse({ success: true })
}

const normalizeStaffFields = (value: any): StaffFields => ({
  team_name: requireString(value?.team_name, '隊名'),
  leader_name: requireString(value?.leader_name, '領隊'),
  leader_phone: String(value?.leader_phone || '').trim(),
  head_coach_name: requireString(value?.head_coach_name, '總教練'),
  head_coach_phone: String(value?.head_coach_phone || '').trim(),
  coach_1_name: String(value?.coach_1_name || '').trim(),
  coach_1_phone: String(value?.coach_1_phone || '').trim(),
  coach_2_name: String(value?.coach_2_name || '').trim(),
  coach_2_phone: String(value?.coach_2_phone || '').trim(),
  manager_name: requireString(value?.manager_name, '管理'),
  manager_phone: String(value?.manager_phone || '').trim(),
  contact_name: requireString(value?.contact_name, '聯絡人'),
  contact_phone: requireString(value?.contact_phone, '聯絡手機')
})

const isActivePlayer = (member: any) => (
  ['球員', '校隊'].includes(String(member?.role || '')) &&
  !['退隊', '離隊'].includes(String(member?.status || '')) &&
  member?.is_inactive_or_graduated !== true
)

const normalizeOverride = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 120) : ''

const validatePlayers = (profileKey: RegistrationProfileKey, players: DocumentPlayer[]) => {
  for (const [index, player] of players.entries()) {
    const prefix = `第 ${index + 1} 位球員`
    if (!player.name || !player.jersey_number || !/^\d{4}-\d{2}-\d{2}/.test(player.birth_date)) {
      throw jsonResponse({ success: false, error: `${prefix}缺少姓名、背號或生日` }, 400)
    }
    if (profileKey === 'just_baseball_taipei') {
      if (!player.national_id || !player.school_name || !player.grade) {
        throw jsonResponse({ success: false, error: `${prefix}缺少身分證、學校或年級` }, 400)
      }
      if (!normalizeHandCode(player.throwing_hand || '') || !normalizeHandCode(player.batting_hand || '')) {
        throw jsonResponse({ success: false, error: `${prefix}的投打慣用手需要人工確認為左或右` }, 400)
      }
    }
  }
}

const avatarStoragePath = (avatarUrl: unknown) => {
  if (typeof avatarUrl !== 'string' || !avatarUrl) return ''
  try {
    const url = new URL(avatarUrl)
    if (url.origin !== new URL(SUPABASE_URL).origin) return ''
    const markers = ['/storage/v1/object/public/avatars/', '/storage/v1/object/sign/avatars/']
    const marker = markers.find((value) => url.pathname.includes(value))
    if (!marker) return ''
    return decodeURIComponent(url.pathname.slice(url.pathname.indexOf(marker) + marker.length))
  } catch {
    return ''
  }
}

const loadAvatar = async (member: any): Promise<DocumentPlayer['avatar'] | undefined> => {
  if (member?.portrait_auth !== true) return undefined
  const path = avatarStoragePath(member?.avatar_url)
  if (!path) return undefined
  const { data, error } = await serviceClient.storage.from('avatars').download(path)
  if (error || !data || data.size > MAX_AVATAR_BYTES) return undefined
  const mimeType = data.type === 'image/png' ? 'image/png' : data.type === 'image/jpeg' ? 'image/jpeg' : ''
  if (!mimeType) return undefined
  return { bytes: new Uint8Array(await data.arrayBuffer()), mimeType }
}

const buildDocumentPlayers = async (userClient: SupabaseClient, selections: any[]) => {
  if (!Array.isArray(selections) || selections.length < 1) {
    throw jsonResponse({ success: false, error: '請至少選擇一位球員' }, 400)
  }
  const memberIds = selections.map((row) => requireString(row?.member_id, '球員')).filter((id, index, all) => all.indexOf(id) === index)
  if (memberIds.length !== selections.length) throw jsonResponse({ success: false, error: '球員不可重複選取' }, 400)

  const { data, error } = await userClient.rpc('list_team_members_for_edit')
  if (error) throw error
  const members = new Map((data || []).filter(isActivePlayer).map((member: any) => [String(member.id), member]))

  return Promise.all(selections.map(async (selection) => {
    const member: any = members.get(String(selection.member_id))
    if (!member) throw jsonResponse({ success: false, error: '選取的球員不存在或已停用' }, 400)
    const override = selection?.overrides || {}
    return {
      id: String(member.id),
      name: String(member.name || '').trim(),
      jersey_number: normalizeOverride(override.jersey_number) || String(member.jersey_number || '').trim(),
      birth_date: normalizeOverride(override.birth_date) || String(member.birth_date || '').trim(),
      national_id: normalizeOverride(override.national_id) || String(member.national_id || '').trim(),
      throwing_hand: normalizeOverride(override.throwing_hand) || String(member.throwing_hand || '').trim(),
      batting_hand: normalizeOverride(override.batting_hand) || String(member.batting_hand || '').trim(),
      school_name: normalizeOverride(override.school_name) || String(member.school_name || '').trim(),
      grade: normalizeOverride(override.grade) || String(member.grade || '').trim(),
      position: normalizeOverride(override.position) as DocumentPlayer['position'],
      portrait_auth: member.portrait_auth === true,
      avatar: await loadAvatar(member)
    } satisfies DocumentPlayer
  }))
}

const handleGenerate = async (payload: any, userId: string, userClient: SupabaseClient) => {
  await assertPermission(userClient, 'registration_forms', 'CREATE')
  await assertPermission(userClient, 'players', 'EDIT')
  const template = await getTemplate(requireString(payload?.template_id, '範本'))
  const profileKey = String(template.profile_key || '') as RegistrationProfileKey
  const profile = REGISTRATION_PROFILES[profileKey]
  if (!profile || profile.version !== Number(template.profile_version)) {
    throw jsonResponse({ success: false, error: '範本版型版本不受支援' }, 400)
  }

  const selections = Array.isArray(payload?.players) ? payload.players : []
  if (selections.length > profile.maxPlayers) {
    throw jsonResponse({ success: false, error: `此版型最多 ${profile.maxPlayers} 人` }, 400)
  }
  const fields = normalizeStaffFields(payload?.fields)
  const players = await buildDocumentPlayers(userClient, selections)
  validatePlayers(profileKey, players)

  const { data: templateBlob, error: downloadError } = await serviceClient.storage
    .from('registration-forms')
    .download(template.storage_path)
  if (downloadError || !templateBlob) throw downloadError || new Error('無法下載範本')

  let output: Uint8Array
  try {
    output = generateRegistrationDocument(
      new Uint8Array(await templateBlob.arrayBuffer()),
      profileKey,
      { fields, players }
    )
  } catch (error) {
    throw jsonResponse({ success: false, error: error instanceof Error ? error.message : '產生檔案失敗' }, 400)
  }

  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const datePart = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((part) => part.type === type)?.value || ''
  const date = `${datePart('year')}${datePart('month')}${datePart('day')}`
  const baseName = String(template.original_file_name || template.name).replace(/\.(xlsx|docx)$/i, '')
  const outputFileName = safeFileName(`${baseName}_已填寫_${date}.${profile.fileType}`)
  const { error: logError } = await serviceClient.from('registration_form_generation_logs').insert({
    template_id: template.id,
    template_name_snapshot: template.name,
    output_file_name: outputFileName,
    player_count: players.length,
    generated_by: userId
  })
  if (logError) throw logError

  const contentType = profile.fileType === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const encoded = encodeURIComponent(outputFileName)
  return new Response(output, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="registration-form.${profile.fileType}"; filename*=UTF-8''${encoded}`,
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache'
    }
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'method not allowed' }, 405)

  try {
    const { userId, userClient } = await getAuthenticatedContext(req)
    if ((req.headers.get('content-type') || '').includes('multipart/form-data')) {
      return await handleUpload(req, userId, userClient)
    }

    const payload = await parseJson(req)
    if (payload?.action === 'delete_template') return await handleDelete(payload, userClient)
    if (payload?.action === 'generate') return await handleGenerate(payload, userId, userClient)
    return jsonResponse({ success: false, error: '不支援的操作' }, 400)
  } catch (error) {
    return errorResponse(error)
  }
})
