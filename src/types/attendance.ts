export interface AttendanceEventSummary {
  id: string
  title: string
  date: string
  event_type: string
  profiles: { name: string | null; nickname: string | null } | null
  presentCount: number
  leaveCount: number
  absentCount: number
  totalCount: number
}
