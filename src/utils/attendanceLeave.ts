import { normalizeLeaveTimeSegment } from './leaveRequests'

export const ATTENDANCE_STATUS_UNSET = ''
export const ATTENDANCE_STATUS_PENDING = '待點名'
export const ATTENDANCE_STATUS_LEAVE = '請假'
const ATTENDANCE_LEAVE_STATUS_ALIASES = new Set([
  ATTENDANCE_STATUS_LEAVE,
  '事假',
  '病假',
  '公假',
  '其他'
])

export type AttendanceLeaveRecord = {
  id?: string | number | null
  user_id?: string | number | null
  member_id?: string | number | null
  leave_type?: string | null
  leave_time_segment?: string | null
  start_date?: string | null
  end_date?: string | null
  reason?: string | null
  team_members?: AttendanceLeaveMember | AttendanceLeaveMember[] | null
}

export type AttendanceLeaveMember = {
  id?: string | number | null
  name?: string | null
  avatar_url?: string | null
  role?: string | null
  jersey_number?: string | number | null
  status?: string | null
  team_group?: string | null
}

export type AttendanceLeaveSummaryRow = {
  id: string
  member_id: string
  name: string
  avatar_url: string | null
  role: string | null
  jersey_number: string | number | null
  status: string | null
  team_group: string | null
  leave_type: string | null
  leave_time_segment: string | null
  start_date: string | null
  end_date: string | null
  reason: string | null
  in_roll_call_list: boolean
}

export const normalizeAttendanceMemberId = (value: unknown) => {
  return String(value ?? '').trim()
}

export const normalizeAttendanceDate = (value: unknown) => {
  const text = String(value ?? '').trim()
  const match = text.match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : text
}

export const parseEventTimeMinutes = (value: unknown) => {
  const text = String(value ?? '')
  const matches = Array.from(text.matchAll(
    /(?:(上午|早上|am|a\.m\.|下午|晚上|pm|p\.m\.)\s*)?\b([01]?\d|2[0-3])\s*[:：.．]\s*([0-5]\d)\b/gi
  ))

  return matches.map((match) => {
    const marker = String(match[1] || '').toLowerCase()
    let hour = Number(match[2])
    const minute = Number(match[3])

    if (['下午', '晚上', 'pm', 'p.m.'].includes(marker) && hour >= 1 && hour <= 11) {
      hour += 12
    } else if (['上午', '早上', 'am', 'a.m.'].includes(marker) && hour === 12) {
      hour = 0
    }

    return hour * 60 + minute
  })
}

const formatEventTimeMinute = (minuteOfDay: number) => {
  const hour = Math.floor(minuteOfDay / 60)
  const minute = minuteOfDay % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const normalizeEventTimeText = (value: unknown) =>
  parseEventTimeMinutes(value).map(formatEventTimeMinute).join(' - ')

export const leaveTimeSegmentOverlapsEventTime = (
  leaveTimeSegment: unknown,
  eventTimeText?: unknown
) => {
  const segment = normalizeLeaveTimeSegment(leaveTimeSegment)
  if (segment === 'full_day') return true

  const eventMinutes = parseEventTimeMinutes(eventTimeText)
  if (eventMinutes.length === 0) return true

  const eventStart = eventMinutes[0]
  const eventEnd = eventMinutes[1] ?? eventStart
  const segmentStart = segment === 'morning' ? 0 : 12 * 60
  const segmentEnd = segment === 'morning' ? 12 * 60 : 24 * 60

  if (eventEnd > eventStart) {
    return eventStart < segmentEnd && eventEnd > segmentStart
  }

  return eventStart >= segmentStart && eventStart < segmentEnd
}

export const filterAttendanceLeaveRecordsForEvent = <T extends AttendanceLeaveRecord>(
  records: T[] | null | undefined,
  eventTimeText?: unknown
) => (records || []).filter((record) =>
  leaveTimeSegmentOverlapsEventTime(record.leave_time_segment, eventTimeText)
)

export const buildAttendanceLeaveMemberIdSet = (records: AttendanceLeaveRecord[] | null | undefined) => {
  const ids = (records || [])
    .map((record) => {
      const member = normalizeAttendanceLeaveMember(record.team_members)
      return normalizeAttendanceMemberId(member?.id ?? record.user_id ?? record.member_id)
    })
    .filter(Boolean)

  return new Set(ids)
}

export const normalizeAttendanceLeaveMember = (
  member: AttendanceLeaveRecord['team_members']
): AttendanceLeaveMember | null => {
  if (Array.isArray(member)) return member[0] || null
  return member || null
}

export const buildAttendanceLeaveSummaryRows = (
  records: AttendanceLeaveRecord[] | null | undefined,
  rollCallMembers: AttendanceLeaveMember[] | null | undefined = []
) => {
  const rollCallMemberById = new Map(
    (rollCallMembers || [])
      .map((member) => [normalizeAttendanceMemberId(member.id), member] as const)
      .filter(([memberId]) => Boolean(memberId))
  )
  const rowsByMemberId = new Map<string, AttendanceLeaveSummaryRow>()

  ;(records || []).forEach((record) => {
    const relatedMember = normalizeAttendanceLeaveMember(record.team_members)
    const memberId = normalizeAttendanceMemberId(relatedMember?.id ?? record.user_id ?? record.member_id)
    const rowId = normalizeAttendanceMemberId(record.id)
    const dedupeKey = memberId || rowId
    if (!dedupeKey || rowsByMemberId.has(dedupeKey)) return

    const rollCallMember = rollCallMemberById.get(memberId) || null
    const displayMember = rollCallMember || relatedMember
    const name = String(displayMember?.name || '').trim() || '未知球員'

    rowsByMemberId.set(dedupeKey, {
      id: rowId || dedupeKey,
      member_id: memberId,
      name,
      avatar_url: displayMember?.avatar_url || null,
      role: displayMember?.role || null,
      jersey_number: displayMember?.jersey_number || null,
      status: displayMember?.status || null,
      team_group: displayMember?.team_group || null,
      leave_type: record.leave_type || null,
      leave_time_segment: record.leave_time_segment || null,
      start_date: record.start_date || null,
      end_date: record.end_date || null,
      reason: record.reason || null,
      in_roll_call_list: Boolean(rollCallMember)
    })
  })

  return Array.from(rowsByMemberId.values())
}

export const getDefaultAttendanceStatusForMember = (
  memberId: unknown,
  leaveMemberIds: ReadonlySet<string>,
  fallbackStatus = ATTENDANCE_STATUS_UNSET
) => {
  const normalizedMemberId = normalizeAttendanceMemberId(memberId)
  return normalizedMemberId && leaveMemberIds.has(normalizedMemberId)
    ? ATTENDANCE_STATUS_LEAVE
    : fallbackStatus
}

export const normalizeRollCallStatus = (status: unknown) => {
  const normalizedStatus = String(status ?? '').trim()
  if (normalizedStatus === ATTENDANCE_STATUS_PENDING) {
    return ATTENDANCE_STATUS_UNSET
  }

  return ATTENDANCE_LEAVE_STATUS_ALIASES.has(normalizedStatus)
    ? ATTENDANCE_STATUS_LEAVE
    : normalizedStatus
}
