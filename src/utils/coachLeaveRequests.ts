import { getProfileAccessState, type ProfileAccessInput } from '@/utils/profileAccess'
import { normalizeSchedulableCoaches } from '@/utils/coachSchedules'
import type {
  CoachLeaveList,
  CoachLeaveRequest,
  CoachLeaveSaveInput,
  CoachLeaveTimeSegment
} from '@/types/coachLeaveRequest'

export const COACH_LEAVE_TIME_SEGMENTS: { value: CoachLeaveTimeSegment; label: string }[] = [
  { value: 'full_day', label: '全日' },
  { value: 'morning', label: '上午（13:00 前）' },
  { value: 'afternoon', label: '下午（13:00 起）' }
]

export const isActiveCoachProfile = (
  profile: (ProfileAccessInput & { role?: string | null }) | null | undefined,
  now: string | Date | number = new Date()
) => {
  const role = String(profile?.role || '').trim().toUpperCase()
  return ['HEAD_COACH', 'COACH', '總教練', '教練'].includes(role)
    && getProfileAccessState(profile, now).allowed
}

export const getTaiwanToday = (now: Date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now)
  const value = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export const createCoachLeaveRequestId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes)
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256) })
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  return Array.from(bytes, (byte, index) =>
    `${[4, 6, 8, 10].includes(index) ? '-' : ''}${byte.toString(16).padStart(2, '0')}`
  ).join('')
}

const isDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const validateCoachLeaveInput = (
  input: CoachLeaveSaveInput,
  manage = false,
  today = getTaiwanToday()
) => {
  const errors: Partial<Record<'coach_profile_id' | 'start_date' | 'end_date' | 'time_segment' | 'reason', string>> = {}
  if (manage && !input.coach_profile_id) errors.coach_profile_id = '請選擇教練。'
  if (!isDate(input.start_date)) errors.start_date = '請選擇有效的開始日期。'
  else if (input.start_date < today) errors.start_date = '只可新增或修改今天起的請假。'
  if (!isDate(input.end_date)) errors.end_date = '請選擇有效的結束日期。'
  else if (isDate(input.start_date) && input.end_date < input.start_date) errors.end_date = '結束日期不可早於開始日期。'
  if (!COACH_LEAVE_TIME_SEGMENTS.some((segment) => segment.value === input.time_segment)) {
    errors.time_segment = '請選擇請假時段。'
  } else if (input.start_date !== input.end_date && input.time_segment !== 'full_day') {
    errors.time_segment = '連續多日請假只能選擇全日。'
  }
  if ([...(input.reason || '')].length > 500) errors.reason = '原因最多 500 字。'
  return errors
}

export const canChangeCoachLeave = (leave: CoachLeaveRequest, today = getTaiwanToday()) =>
  leave.status === 'active' && leave.end_date >= today

export const formatCoachLeaveTimeSegment = (segment: CoachLeaveTimeSegment) =>
  COACH_LEAVE_TIME_SEGMENTS.find((item) => item.value === segment)?.label || '全日'

export const formatCoachLeaveDateRange = (startDate: string, endDate: string) =>
  startDate === endDate ? startDate : `${startDate} ～ ${endDate}`

const parseObject = (value: unknown): Record<string, any> => {
  if (typeof value === 'string') {
    try { return parseObject(JSON.parse(value)) } catch { return {} }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

export const normalizeCoachLeaveList = (payload: unknown): CoachLeaveList => {
  const value = parseObject(payload)
  const leaves: CoachLeaveRequest[] = (Array.isArray(value.leaves) ? value.leaves : [])
    .map((item: unknown): CoachLeaveRequest => {
      const row = parseObject(item)
      return {
        id: String(row.id || ''),
        coach_profile_id: String(row.coach_profile_id || ''),
        coach_name: String(row.coach_name || ''),
        coach_nickname: row.coach_nickname == null ? null : String(row.coach_nickname),
        start_date: String(row.start_date || ''),
        end_date: String(row.end_date || ''),
        time_segment: COACH_LEAVE_TIME_SEGMENTS.some((segment) => segment.value === row.time_segment)
          ? row.time_segment as CoachLeaveTimeSegment : 'full_day',
        reason: row.reason == null ? null : String(row.reason),
        status: row.status === 'cancelled' ? 'cancelled' : 'active',
        created_at: String(row.created_at || ''),
        updated_at: String(row.updated_at || '')
      }
    })
    .filter((row: CoachLeaveRequest) => row.id && row.coach_profile_id)
  return { leaves, coaches: normalizeSchedulableCoaches(value.coaches) }
}

export const normalizeCoachLeaveError = (error: unknown) => {
  const message = error instanceof Error ? error.message
    : String((error as { message?: string } | null)?.message || '')
  if (/PGRST202|Could not find.*function/i.test(message)) return '教練請假功能尚未部署，請聯繫管理員。'
  if (/stale|revision|changed|updated_at|過期版本/i.test(message)) return '假單已由其他人更新，請重新整理後再試。'
  if (/permission|required.*coach|not.*coach|inactive|not authenticated/i.test(message)) return '目前帳號沒有這項操作權限，請重新整理或聯繫管理員。'
  return message || '操作失敗，請稍後再試。'
}
