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
}

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

export const buildTrainingRegistrationNotificationEventKey = (
  session: Pick<TrainingRegistrationNotificationSession, 'session_id' | 'registration_start_at'>
) => `training_registration_open:${session.session_id}:${session.registration_start_at || 'no-start'}`

export const buildTrainingRegistrationNotificationUrl = (
  session: Pick<TrainingRegistrationNotificationSession, 'session_id'>
) => `/training?session_id=${encodeURIComponent(session.session_id)}`

export const buildTrainingRegistrationNotificationTitle = (
  session: Pick<TrainingRegistrationNotificationSession, 'match_name'>
) => `特訓課開放報名：${normalizeDisplayValue(session.match_name)}`

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
  >
) => [
  `課程：${normalizeDisplayValue(session.match_name)}`,
  `日期：${normalizeDisplayValue(session.match_date)}`,
  `時間：${normalizeDisplayValue(session.match_time)}`,
  `地點：${normalizeDisplayValue(session.location)}`,
  `報名截止：${formatDateTimeInTimeZone(session.registration_end_at, TAIPEI_TIME_ZONE)}`,
  `扣點：${Number(session.point_cost ?? 0)} 點`,
  `名額：${session.capacity ? `${session.capacity} 人` : '不限'}`
].join('\n')
