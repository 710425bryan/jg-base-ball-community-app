const TAIPEI_TIME_ZONE = 'Asia/Taipei'
const EMPTY_VALUE = '未設定'

export type TrainingRegistrationNotificationSession = {
  session_id: string
  match_id: string
  match_name?: string | null
  match_date?: string | null
  match_time?: string | null
  location?: string | null
  registration_start_at?: string | null
  registration_end_at?: string | null
  point_cost?: number | null
  capacity?: number | null
  selected_count?: number | null
}

export type TrainingRegistrationNotificationKind = 'open' | 'deadline_reminder'

const normalizeDisplayValue = (value: unknown) => {
  if (value === null || value === undefined) return EMPTY_VALUE
  const normalized = String(value).replace(/\s+/g, ' ').trim()
  return normalized || EMPTY_VALUE
}

const formatDateTimeInTimeZone = (value: string | null | undefined, timeZone: string) => {
  if (!value) return EMPTY_VALUE

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  const parts = formatter.formatToParts(date)
  const partMap = new Map(parts.map((part) => [part.type, part.value]))

  return [
    `${partMap.get('year')}-${partMap.get('month')}-${partMap.get('day')}`,
    `${partMap.get('hour')}:${partMap.get('minute')}`
  ].join(' ')
}

const getRemainingSlotsLabel = (
  session: Pick<TrainingRegistrationNotificationSession, 'capacity' | 'selected_count'>
) => {
  const capacity = Number(session.capacity ?? 0)
  if (!Number.isFinite(capacity) || capacity <= 0) return '不限'

  const selectedCount = Number(session.selected_count ?? 0)
  const remainingSlots = Math.max(0, capacity - (Number.isFinite(selectedCount) ? selectedCount : 0))

  return `${remainingSlots} 人`
}

export const hasRemainingTrainingRegistrationSlots = (
  session: Pick<TrainingRegistrationNotificationSession, 'capacity' | 'selected_count'>
) => {
  const capacity = Number(session.capacity ?? 0)
  if (!Number.isFinite(capacity) || capacity <= 0) return true

  const selectedCount = Number(session.selected_count ?? 0)
  return (Number.isFinite(selectedCount) ? selectedCount : 0) < capacity
}

export const isTrainingRegistrationDeadlineReminderDue = (
  session: Pick<TrainingRegistrationNotificationSession, 'registration_end_at'>,
  now: Date,
  reminderWindowMs = 24 * 60 * 60 * 1000
) => {
  if (!session.registration_end_at) return false

  const endTime = new Date(session.registration_end_at).getTime()
  if (Number.isNaN(endTime)) return false

  const nowTime = now.getTime()
  return endTime > nowTime && endTime - nowTime <= reminderWindowMs
}

export const buildTrainingRegistrationNotificationEventKey = (
  session: Pick<TrainingRegistrationNotificationSession, 'session_id' | 'registration_start_at' | 'registration_end_at'>,
  kind: TrainingRegistrationNotificationKind = 'open'
) => {
  if (kind === 'deadline_reminder') {
    return `training_registration_deadline:${session.session_id}:${session.registration_end_at || 'no-end'}`
  }

  return `training_registration_open:${session.session_id}:${session.registration_start_at || 'no-start'}`
}

export const buildTrainingRegistrationNotificationUrl = (
  session: Pick<TrainingRegistrationNotificationSession, 'session_id'>
) => `/training?session_id=${encodeURIComponent(session.session_id)}`

export const buildTrainingRegistrationNotificationTitle = (
  session: Pick<TrainingRegistrationNotificationSession, 'match_name'>,
  kind: TrainingRegistrationNotificationKind = 'open'
) => kind === 'deadline_reminder'
  ? `特訓課報名即將截止：${normalizeDisplayValue(session.match_name)}`
  : `特訓課開放報名：${normalizeDisplayValue(session.match_name)}`

export const buildTrainingRegistrationNotificationBody = (
  session: Pick<
    TrainingRegistrationNotificationSession,
    | 'match_name'
    | 'match_date'
    | 'match_time'
    | 'location'
    | 'registration_end_at'
    | 'point_cost'
    | 'capacity'
    | 'selected_count'
  >,
  kind: TrainingRegistrationNotificationKind = 'open'
) => {
  const lines = [
    `課程：${normalizeDisplayValue(session.match_name)}`,
    `日期：${normalizeDisplayValue(session.match_date)}`,
    `時間：${normalizeDisplayValue(session.match_time)}`,
    `地點：${normalizeDisplayValue(session.location)}`,
    `報名截止：${formatDateTimeInTimeZone(session.registration_end_at, TAIPEI_TIME_ZONE)}`,
    `扣點：${Number(session.point_cost ?? 0)} 點`,
    `名額：${session.capacity ? `${session.capacity} 人` : '不限'}`
  ]

  if (kind === 'deadline_reminder') {
    lines.push(`剩餘名額：${getRemainingSlotsLabel(session)}`)
  }

  return lines.join('\n')
}
