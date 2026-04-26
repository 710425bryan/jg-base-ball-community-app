export type ProfileAccessStatus = 'active' | 'suspended' | 'not_started' | 'expired'

export type ProfileAccessInput = {
  is_active?: boolean | null
  access_start?: string | null
  access_end?: string | null
}

export type ProfileAccessState = {
  allowed: boolean
  status: ProfileAccessStatus
  label: string
  message: string
}

const toTime = (value?: string | Date | number | null) => {
  if (value == null || value === '') return null

  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(parsed) ? null : parsed
}

export const getProfileAccessState = (
  profile: ProfileAccessInput | null | undefined,
  now: string | Date | number = new Date()
): ProfileAccessState => {
  const currentTime = toTime(now) ?? Date.now()
  const startTime = toTime(profile?.access_start)
  const endTime = toTime(profile?.access_end)

  if (profile?.is_active === false) {
    return {
      allowed: false,
      status: 'suspended',
      label: '已停權',
      message: '此帳號已被停權，無法登入系統。'
    }
  }

  if (startTime != null && currentTime < startTime) {
    return {
      allowed: false,
      status: 'not_started',
      label: '尚未開始',
      message: '此帳號尚未到可登入時間。'
    }
  }

  if (endTime != null && currentTime > endTime) {
    return {
      allowed: false,
      status: 'expired',
      label: '已過期',
      message: '此帳號的可登入時間已結束。'
    }
  }

  return {
    allowed: true,
    status: 'active',
    label: '可登入',
    message: '此帳號目前可登入系統。'
  }
}

export const isProfileAccessAllowed = (
  profile: ProfileAccessInput | null | undefined,
  now: string | Date | number = new Date()
) => getProfileAccessState(profile, now).allowed
