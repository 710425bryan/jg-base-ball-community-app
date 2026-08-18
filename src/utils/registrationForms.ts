import type {
  RegistrationFormProfileKey,
  RegistrationPlayerRow,
  RegistrationStaffFields,
  RegistrationValidationResult
} from '@/types/registrationForm'

export const REGISTRATION_FORM_PROFILES = {
  just_baseball_taipei: {
    label: '就是棒臺北',
    fileType: 'xlsx',
    maxPlayers: 30,
    requiredPlayerFields: ['jersey_number', 'birth_date', 'national_id', 'throwing_hand', 'batting_hand', 'school_name', 'grade']
  },
  chairperson_cup_u9: {
    label: '主委盃 U9',
    fileType: 'docx',
    maxPlayers: 20,
    requiredPlayerFields: ['jersey_number', 'birth_date']
  }
} as const

export const createRegistrationStaffFields = (): RegistrationStaffFields => ({
  team_name: '中港熊戰',
  leader_name: '',
  leader_phone: '',
  head_coach_name: '',
  head_coach_phone: '',
  coach_1_name: '',
  coach_1_phone: '',
  coach_2_name: '',
  coach_2_phone: '',
  manager_name: '',
  manager_phone: '',
  contact_name: '',
  contact_phone: ''
})

export const isActiveRegistrationPlayer = (member: any) => (
  ['球員', '校隊'].includes(String(member?.role || '')) &&
  !['退隊', '離隊'].includes(String(member?.status || '')) &&
  member?.is_inactive_or_graduated !== true
)

export const isActiveRegistrationStaffMember = (member: any) => (
  ['教練', '管理群', '球員', '校隊'].includes(String(member?.role || '')) &&
  !['退隊', '離隊'].includes(String(member?.status || '')) &&
  member?.is_inactive_or_graduated !== true
)

export const getRegistrationMemberPhone = (member: any) => String(
  member?.guardian_phone || member?.phone || member?.mobile || ''
).trim()

const jerseySortValue = (value: unknown) => {
  const text = String(value ?? '').trim()
  const numeric = Number(text)
  return { text, numeric: text && Number.isFinite(numeric) ? numeric : Number.POSITIVE_INFINITY }
}

export const sortRegistrationMembers = <T extends { jersey_number?: unknown; name?: unknown }>(members: T[]) =>
  [...members].sort((left, right) => {
    const leftJersey = jerseySortValue(left.jersey_number)
    const rightJersey = jerseySortValue(right.jersey_number)
    return leftJersey.numeric - rightJersey.numeric
      || leftJersey.text.localeCompare(rightJersey.text, 'zh-Hant', { numeric: true })
      || String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hant')
  })

export const createRegistrationPlayerRow = (member: any): RegistrationPlayerRow => ({
  member_id: String(member?.id || ''),
  name: String(member?.name || '').trim(),
  portrait_auth: member?.portrait_auth === true,
  avatar_url: String(member?.avatar_url || '').trim(),
  overrides: {
    jersey_number: String(member?.jersey_number || '').trim(),
    birth_date: String(member?.birth_date || '').slice(0, 10),
    national_id: String(member?.national_id || '').trim(),
    throwing_hand: String(member?.throwing_hand || '').trim(),
    batting_hand: String(member?.batting_hand || '').trim(),
    school_name: String(member?.school_name || '').trim(),
    grade: String(member?.grade || '').trim(),
    position: ''
  }
})

export const normalizeRegistrationHandCode = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase()
  if ((normalized.includes('左') && normalized.includes('右')) || normalized.includes('開弓')) return ''
  if (normalized === 'r' || normalized.includes('右')) return 'R'
  if (normalized === 'l' || normalized.includes('左')) return 'L'
  return ''
}

const missingStaffFields = (fields: RegistrationStaffFields) => {
  const required: Array<[keyof RegistrationStaffFields, string]> = [
    ['team_name', '隊名'],
    ['leader_name', '領隊'],
    ['head_coach_name', '總教練'],
    ['manager_name', '管理'],
    ['contact_name', '聯絡人'],
    ['contact_phone', '聯絡手機']
  ]
  return required.filter(([key]) => !String(fields[key] || '').trim()).map(([, label]) => label)
}

export const validateRegistrationForm = (
  profileKey: RegistrationFormProfileKey,
  maxPlayers: number,
  fields: RegistrationStaffFields,
  players: RegistrationPlayerRow[]
): RegistrationValidationResult => {
  const blocking: string[] = []
  const warnings: string[] = []
  const staffMissing = missingStaffFields(fields)
  if (staffMissing.length) blocking.push(`隊職員資料缺少：${staffMissing.join('、')}`)
  if (!players.length) blocking.push('請至少選擇一位球員')
  if (players.length > maxPlayers) blocking.push(`此版型最多只能選擇 ${maxPlayers} 位球員`)

  players.forEach((player, index) => {
    const label = `第 ${index + 1} 位「${player.name || '未命名'}」`
    if (!player.name) blocking.push(`${label}缺少姓名`)
    if (!player.overrides.jersey_number) blocking.push(`${label}缺少背號`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(player.overrides.birth_date)) blocking.push(`${label}缺少有效生日`)

    if (profileKey === 'just_baseball_taipei') {
      if (!player.overrides.national_id) blocking.push(`${label}缺少身分證`)
      if (!player.overrides.school_name) blocking.push(`${label}缺少學校`)
      if (!player.overrides.grade) blocking.push(`${label}缺少年級`)
      if (!normalizeRegistrationHandCode(player.overrides.throwing_hand)) {
        blocking.push(`${label}的投球慣用手需人工確認為左投或右投`)
      }
      if (!normalizeRegistrationHandCode(player.overrides.batting_hand)) {
        blocking.push(`${label}的打擊慣用手需人工確認為左打或右打`)
      }
    }

    if (!player.portrait_auth) warnings.push(`${label}未同意肖像授權，照片格將保留空白`)
    else if (!player.avatar_url) warnings.push(`${label}缺少照片，照片格將保留空白`)
  })

  return { blocking, warnings }
}
