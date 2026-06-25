import dayjs from 'dayjs'
import type {
  CoachScheduleAssignment,
  CoachScheduleDashboardScope,
  CoachScheduleEvent,
  CoachScheduleMonthPayload,
  CoachScheduleSourceType,
  CoachScheduleStatus,
  SchedulableCoach
} from '@/types/coachSchedule'

const SOURCE_TYPES: CoachScheduleSourceType[] = [
  'training_location',
  'training_date',
  'training_class',
  'match',
  'manual'
]

const STATUS_VALUES: CoachScheduleStatus[] = ['scheduled', 'cancelled']

export const COACH_SCHEDULE_SOURCE_LABELS: Record<CoachScheduleSourceType, string> = {
  training_location: '場地訓練',
  training_date: '週六訓練',
  training_class: '特訓課',
  match: '比賽',
  manual: '手動排班'
}

export const COACH_SCHEDULE_SOURCE_ORDER: Record<CoachScheduleSourceType, number> = {
  training_location: 10,
  training_class: 20,
  training_date: 30,
  match: 40,
  manual: 90
}

export const normalizeCoachScheduleMonth = (month?: string | null) => {
  const parsed = month ? dayjs(month) : dayjs()
  const safeMonth = parsed.isValid() ? parsed : dayjs()
  return safeMonth.format('YYYY-MM')
}

export const getCoachScheduleMonthStart = (month?: string | null) =>
  `${normalizeCoachScheduleMonth(month)}-01`

const toStringOrNull = (value: unknown) => {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text.length > 0 ? text : null
}

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    : []

const normalizeJsonArrayPayload = (value: unknown) => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const normalizeCoachScheduleSourceType = (value: unknown): CoachScheduleSourceType => {
  const text = String(value || '').trim()
  return SOURCE_TYPES.includes(text as CoachScheduleSourceType)
    ? text as CoachScheduleSourceType
    : 'manual'
}

export const normalizeCoachScheduleStatus = (value: unknown): CoachScheduleStatus => {
  const text = String(value || '').trim()
  return STATUS_VALUES.includes(text as CoachScheduleStatus)
    ? text as CoachScheduleStatus
    : 'scheduled'
}

export const getCoachScheduleSourceLabel = (sourceType: CoachScheduleSourceType) =>
  COACH_SCHEDULE_SOURCE_LABELS[sourceType] || '排班'

export const getCoachScheduleEventKey = (event: Pick<CoachScheduleEvent, 'source_type' | 'source_id' | 'source_venue_id' | 'schedule_date' | 'id'>) => {
  if (event.source_type === 'training_date') {
    return `training_date:${event.schedule_date}`
  }

  if (event.source_type !== 'manual' && event.source_id) {
    return `${event.source_type}:${event.source_id}:${event.source_venue_id || 'none'}`
  }

  return `manual:${event.id || event.schedule_date}`
}

export const normalizeSchedulableCoach = (row: any): SchedulableCoach => ({
  id: String(row?.id || ''),
  name: String(row?.name || row?.nickname || ''),
  nickname: toStringOrNull(row?.nickname),
  role: String(row?.role || ''),
  avatar_url: toStringOrNull(row?.avatar_url)
})

export const normalizeSchedulableCoaches = (payload: unknown) =>
  normalizeJsonArrayPayload(payload)
    .map(normalizeSchedulableCoach)
    .filter((coach) => coach.id && coach.name)

export const normalizeCoachScheduleAssignment = (row: any): CoachScheduleAssignment => ({
  id: String(row?.id || ''),
  event_id: String(row?.event_id || ''),
  coach_profile_id: String(row?.coach_profile_id || ''),
  coach_name: String(row?.coach_name || ''),
  coach_nickname: toStringOrNull(row?.coach_nickname),
  coach_role: toStringOrNull(row?.coach_role),
  coach_avatar_url: toStringOrNull(row?.coach_avatar_url),
  role_label: toStringOrNull(row?.role_label),
  note: toStringOrNull(row?.note)
})

export const normalizeCoachScheduleEvent = (row: any): CoachScheduleEvent => {
  const sourceType = normalizeCoachScheduleSourceType(row?.source_type)
  const normalizedAssignments = ((Array.isArray(row?.assignments) ? row.assignments : []) as any[])
    .map(normalizeCoachScheduleAssignment)
  const assignments = normalizedAssignments.filter(
    (assignment: CoachScheduleAssignment) => assignment.coach_profile_id
  )
  const coachProfileIds = normalizeStringArray(row?.coach_profile_ids)
  const assignmentCoachIds = assignments.map((assignment) => assignment.coach_profile_id)

  return {
    id: toStringOrNull(row?.id),
    is_persisted: Boolean(row?.is_persisted || row?.id),
    is_candidate: row?.is_candidate !== false,
    source_type: sourceType,
    source_id: toStringOrNull(row?.source_id),
    source_venue_id: toStringOrNull(row?.source_venue_id),
    schedule_date: String(row?.schedule_date || ''),
    start_time: toStringOrNull(row?.start_time),
    end_time: toStringOrNull(row?.end_time),
    title: String(row?.title || getCoachScheduleSourceLabel(sourceType)),
    location: toStringOrNull(row?.location),
    location_url: toStringOrNull(row?.location_url),
    legacy_coaches: toStringOrNull(row?.legacy_coaches),
    status: normalizeCoachScheduleStatus(row?.status),
    note: toStringOrNull(row?.note),
    coach_profile_ids: [...new Set([...coachProfileIds, ...assignmentCoachIds])],
    assignments,
    created_at: toStringOrNull(row?.created_at),
    updated_at: toStringOrNull(row?.updated_at)
  }
}

export const sortCoachScheduleEvents = (events: CoachScheduleEvent[]) =>
  [...events].sort((left, right) => {
    const dateCompare = left.schedule_date.localeCompare(right.schedule_date)
    if (dateCompare !== 0) return dateCompare

    const leftTime = left.start_time || '23:59'
    const rightTime = right.start_time || '23:59'
    const timeCompare = leftTime.localeCompare(rightTime)
    if (timeCompare !== 0) return timeCompare

    const sourceCompare =
      COACH_SCHEDULE_SOURCE_ORDER[left.source_type] - COACH_SCHEDULE_SOURCE_ORDER[right.source_type]
    if (sourceCompare !== 0) return sourceCompare

    return left.title.localeCompare(right.title, 'zh-Hant')
  })

export const mergeCoachScheduleEvents = (events: CoachScheduleEvent[]) => {
  const byKey = new Map<string, CoachScheduleEvent>()

  events.forEach((event) => {
    const key = getCoachScheduleEventKey(event)
    const existing = byKey.get(key)

    if (!existing || (!existing.is_persisted && event.is_persisted)) {
      byKey.set(key, {
        ...event,
        coach_profile_ids: [...new Set(event.coach_profile_ids)],
        assignments: [...event.assignments]
      })
      return
    }

    byKey.set(key, {
      ...existing,
      coach_profile_ids: [...new Set([...existing.coach_profile_ids, ...event.coach_profile_ids])],
      assignments: event.is_persisted ? event.assignments : existing.assignments
    })
  })

  return sortCoachScheduleEvents([...byKey.values()])
}

export const normalizeCoachScheduleMonthPayload = (
  payload: any,
  month?: string | null
): CoachScheduleMonthPayload => {
  const monthStart = String(payload?.month_start || getCoachScheduleMonthStart(month))
  const scopeText = String(payload?.scope || 'none')
  const scope: CoachScheduleDashboardScope =
    scopeText === 'admin' || scopeText === 'all' || scopeText === 'own' || scopeText === 'none'
      ? scopeText
      : 'none'

  return {
    month_start: getCoachScheduleMonthStart(monthStart),
    scope,
    events: mergeCoachScheduleEvents(
      (normalizeJsonArrayPayload(payload?.events) as any[])
        .map(normalizeCoachScheduleEvent)
        .filter((event: CoachScheduleEvent) => event.schedule_date)
    )
  }
}

export const formatCoachScheduleDateLabel = (date: string) => {
  const parsed = dayjs(date)
  if (!parsed.isValid()) return date
  return `${parsed.format('M/D')} 週${'日一二三四五六'[parsed.day()]}`
}

export const formatCoachScheduleMonthLabel = (monthStart: string) => {
  const parsed = dayjs(monthStart)
  return parsed.isValid() ? parsed.format('YYYY 年 M 月') : monthStart
}

export const formatCoachScheduleTimeRange = (event: Pick<CoachScheduleEvent, 'start_time' | 'end_time'>) => {
  if (event.start_time && event.end_time) return `${event.start_time} - ${event.end_time}`
  if (event.start_time) return event.start_time
  return '時間未定'
}

export const getCoachScheduleDisplayCoachNames = (event: Pick<CoachScheduleEvent, 'assignments'>) =>
  event.assignments
    .map((assignment) => assignment.coach_nickname || assignment.coach_name)
    .filter(Boolean)
