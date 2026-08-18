import { supabase } from '@/services/supabase'
import type {
  RegistrationFormTemplate,
  RegistrationGeneratePayload
} from '@/types/registrationForm'

const FUNCTION_NAME = 'registration-form-documents'
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')

const functionUrl = () => {
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  if (!baseUrl) throw new Error('Supabase URL 尚未設定')
  return `${baseUrl}/functions/v1/${FUNCTION_NAME}`
}

const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('登入狀態已失效，請重新登入')
  return token
}

const parseErrorResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => ({}))
    return String(payload?.error || payload?.message || `操作失敗（${response.status}）`)
  }
  return (await response.text().catch(() => '')).trim() || `操作失敗（${response.status}）`
}

const authorizedFetch = async (init: RequestInit) => {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (supabaseAnonKey) headers.set('apikey', supabaseAnonKey)
  const response = await fetch(functionUrl(), { ...init, headers })
  if (!response.ok) throw new Error(await parseErrorResponse(response))
  return response
}

export const fetchRegistrationFormTemplates = async (): Promise<RegistrationFormTemplate[]> => {
  const { data, error } = await supabase
    .from('registration_form_templates')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as RegistrationFormTemplate[]
}

export const uploadRegistrationFormTemplate = async (file: File, displayName = '') => {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const transportFileName = extension === 'xlsx' || extension === 'docx'
    ? `template.${extension}`
    : 'template.bin'
  const form = new FormData()
  form.append('action', 'upload_template')
  form.append('display_name', displayName)
  form.append('original_file_name', file.name)
  form.append('file', file, transportFileName)
  const response = await authorizedFetch({ method: 'POST', body: form })
  const payload = await response.json()
  return payload.template as RegistrationFormTemplate
}

export const deleteRegistrationFormTemplate = async (templateId: string) => {
  await authorizedFetch({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete_template', template_id: templateId })
  })
}

export const downloadRegistrationFormTemplate = async (template: RegistrationFormTemplate) => {
  const { data, error } = await supabase.storage.from('registration-forms').download(template.storage_path)
  if (error) throw error
  downloadBlob(data, template.original_file_name)
}

const parseDownloadFileName = (response: Response, fallback: string) => {
  const disposition = response.headers.get('content-disposition') || ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (!encoded) return fallback
  try { return decodeURIComponent(encoded) } catch { return fallback }
}

export const generateRegistrationFormDocument = async (
  payload: RegistrationGeneratePayload,
  fallbackFileName: string
) => {
  const response = await authorizedFetch({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', ...payload })
  })
  const blob = await response.blob()
  const fileName = parseDownloadFileName(response, fallbackFileName)
  downloadBlob(blob, fileName)
  return fileName
}

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
