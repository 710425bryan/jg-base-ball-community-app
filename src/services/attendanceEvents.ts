import dayjs from 'dayjs'
import { supabase } from '@/services/supabase'
import type { AttendanceEventSummary } from '@/types/attendance'

interface AttendanceEventRow {
  id: string
  title: string
  date: string
  event_type: string
  profiles: AttendanceEventSummary['profiles']
  training_location_session_id: string | null
  training_location_session_venue_id: string | null
  attendance_records: { status: string }[] | null
}

export async function listAttendanceEvents(month: string): Promise<AttendanceEventSummary[]> {
  // Never allow an empty/invalid filter to become an unbounded history query.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('請選擇有效的查詢月份')
  const start = `${month}-01`
  const end = dayjs(start).add(1, 'month').format('YYYY-MM-DD')

  const [{ data, error }, { count: memberCount, error: memberError }] = await Promise.all([
    supabase
      .from('attendance_events')
      .select('id, title, date, event_type, training_location_session_id, training_location_session_venue_id, profiles(name, nickname), attendance_records(status)')
      .gte('date', start)
      .lt('date', end)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .returns<AttendanceEventRow[]>(),
    supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .in('role', ['球員', '校隊'])
      .neq('status', '退隊')
      .or('fee_billing_mode.is.null,fee_billing_mode.neq.no_fee')
  ])
  if (error) throw error
  if (memberError) throw memberError

  return (data || []).map((event) => {
    const records = event.attendance_records || []
    return {
      id: event.id,
      title: event.title,
      date: event.date,
      event_type: event.event_type,
      profiles: event.profiles,
      presentCount: records.filter((record) => ['出席', '遲到', '早退'].includes(record.status)).length,
      leaveCount: records.filter((record) => record.status === '請假').length,
      absentCount: records.filter((record) => record.status === '缺席').length,
      // Keep venue attendance scoped to its assigned roster, without a team-wide fallback.
      totalCount: event.training_location_session_venue_id || event.training_location_session_id
        ? records.length
        : Math.max(records.length, memberCount || 0)
    }
  })
}
