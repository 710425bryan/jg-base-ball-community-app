import { supabase } from '@/services/supabase'
import {
  createEmptyDashboardTodayAttendanceStatus,
  type DashboardTodayAttendanceEvent,
  type DashboardTodayAttendanceStatus
} from '@/types/dashboard'
import {
  isSupabaseRpcMissingError,
  isSupabaseRpcUnavailable,
  markSupabaseRpcUnavailable
} from '@/utils/supabaseRpc'

const RPC_NAME = 'get_dashboard_today_attendance_status'

const ensureArray = <T>(value: unknown): T[] => Array.isArray(value) ? (value as T[]) : []

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeEvent = (value: unknown): DashboardTodayAttendanceEvent | null => {
  if (!value || typeof value !== 'object') return null
  const event = value as Partial<DashboardTodayAttendanceEvent>
  if (!event.id) return null

  return {
    id: String(event.id),
    title: event.title || '未命名點名單',
    date: event.date || '',
    eventType: event.eventType ?? null
  }
}

const normalizeStatus = (
  payload: Partial<DashboardTodayAttendanceStatus> | null | undefined
): DashboardTodayAttendanceStatus => {
  const fallback = createEmptyDashboardTodayAttendanceStatus()
  const legacyEvent = normalizeEvent(payload?.todayEvent)
  const todayEvents = ensureArray<unknown>(payload?.todayEvents)
    .map(normalizeEvent)
    .filter((event): event is DashboardTodayAttendanceEvent => Boolean(event))
  const normalizedEvents = todayEvents.length > 0
    ? todayEvents
    : legacyEvent
      ? [legacyEvent]
      : fallback.todayEvents

  return {
    todayEvent: normalizedEvents[0] ?? fallback.todayEvent,
    todayEvents: normalizedEvents,
    todayLeaveNames: ensureArray<string>(payload?.todayLeaveNames),
    todayLeaveCount: normalizeNumber(payload?.todayLeaveCount)
  }
}

export const getDashboardTodayAttendanceStatus = async (today?: string | null) => {
  if (isSupabaseRpcUnavailable(RPC_NAME)) {
    return createEmptyDashboardTodayAttendanceStatus()
  }

  const { data, error } = await supabase.rpc(RPC_NAME, {
    p_today: today || null
  })

  if (error) {
    if (isSupabaseRpcMissingError(error, RPC_NAME)) {
      markSupabaseRpcUnavailable(RPC_NAME)
      console.warn(`${RPC_NAME} RPC 尚未部署，今日點名狀態暫時顯示空狀態。`)
      return createEmptyDashboardTodayAttendanceStatus()
    }

    throw error
  }

  return normalizeStatus((data ?? null) as Partial<DashboardTodayAttendanceStatus> | null)
}
