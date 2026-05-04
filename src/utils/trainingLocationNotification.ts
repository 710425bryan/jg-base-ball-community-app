const TAIPEI_TIME_ZONE = 'Asia/Taipei'
const EMPTY_VALUE = '未設定'

export type TrainingLocationNotificationTarget = {
  user_id: string
  session_id: string
  session_updated_at?: string | null
  member_id: string
  member_name: string
  title?: string | null
  training_date?: string | null
  start_time?: string | null
  end_time?: string | null
  venue_name?: string | null
  venue_address?: string | null
  venue_maps_url?: string | null
  is_on_leave?: boolean | null
}

export type TrainingLocationNotificationAssignment = {
  memberId: string
  memberName: string
  venueName: string
  venueAddress?: string | null
  venueMapsUrl?: string | null
}

export type TrainingLocationNotificationGroup = {
  userId: string
  sessionId: string
  sessionUpdatedAt: string | null
  title: string
  trainingDate: string
  startTime: string | null
  endTime: string | null
  assignments: TrainingLocationNotificationAssignment[]
}

const normalizeDisplayValue = (value: unknown) => {
  if (value === null || value === undefined) return EMPTY_VALUE
  const normalized = String(value).replace(/\s+/g, ' ').trim()
  return normalized || EMPTY_VALUE
}

const formatDateInTimeZone = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })

  const parts = formatter.formatToParts(date)
  const partMap = new Map(parts.map((part) => [part.type, part.value]))

  return `${partMap.get('year')}-${partMap.get('month')}-${partMap.get('day')}`
}

const addDaysToDateString = (dateString: string, days: number) => {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

const getTimeLabel = (
  group: Pick<TrainingLocationNotificationGroup, 'startTime' | 'endTime'>
) => {
  if (group.startTime && group.endTime) return `${group.startTime}-${group.endTime}`
  if (group.startTime) return group.startTime
  if (group.endTime) return group.endTime
  return EMPTY_VALUE
}

export const getTrainingLocationTargetDateInTaipei = (now = new Date()) =>
  addDaysToDateString(formatDateInTimeZone(now, TAIPEI_TIME_ZONE), 1)

export const filterTrainingLocationNotificationTargets = (
  targets: TrainingLocationNotificationTarget[]
) => targets.filter((target) => !target.is_on_leave)

export const groupTrainingLocationNotificationTargets = (
  targets: TrainingLocationNotificationTarget[]
) => {
  const groups = new Map<string, TrainingLocationNotificationGroup>()

  for (const target of filterTrainingLocationNotificationTargets(targets)) {
    if (!target.user_id || !target.session_id || !target.member_id) continue

    const key = `${target.user_id}:${target.session_id}`
    const group = groups.get(key) || {
      userId: target.user_id,
      sessionId: target.session_id,
      sessionUpdatedAt: target.session_updated_at || null,
      title: normalizeDisplayValue(target.title),
      trainingDate: normalizeDisplayValue(target.training_date),
      startTime: target.start_time || null,
      endTime: target.end_time || null,
      assignments: []
    }

    if (!group.assignments.some((assignment) => assignment.memberId === target.member_id)) {
      group.assignments.push({
        memberId: target.member_id,
        memberName: normalizeDisplayValue(target.member_name),
        venueName: normalizeDisplayValue(target.venue_name),
        venueAddress: target.venue_address || null,
        venueMapsUrl: target.venue_maps_url || null
      })
    }

    groups.set(key, group)
  }

  return [...groups.values()].map((group) => ({
    ...group,
    assignments: [...group.assignments].sort((left, right) =>
      left.memberName.localeCompare(right.memberName, 'zh-Hant')
    )
  }))
}

export const buildTrainingLocationNotificationEventKey = (
  group: Pick<TrainingLocationNotificationGroup, 'sessionId' | 'userId' | 'sessionUpdatedAt'>
) => `training_location:${group.sessionId}:${group.userId}:${group.sessionUpdatedAt || 'no-updated-at'}`

export const buildTrainingLocationNotificationUrl = (
  group: Pick<TrainingLocationNotificationGroup, 'trainingDate'>
) => `/dashboard?training_date=${encodeURIComponent(group.trainingDate)}`

export const buildTrainingLocationNotificationTitle = (
  group: Pick<TrainingLocationNotificationGroup, 'trainingDate' | 'title'>
) => `訓練場地通知：${normalizeDisplayValue(group.trainingDate)} ${normalizeDisplayValue(group.title)}`

export const buildTrainingLocationNotificationBody = (
  group: TrainingLocationNotificationGroup
) => [
  `日期：${normalizeDisplayValue(group.trainingDate)}`,
  `時間：${getTimeLabel(group)}`,
  ...group.assignments.map((assignment) =>
    `${assignment.memberName}：${assignment.venueName}`
  )
].join('\n')
