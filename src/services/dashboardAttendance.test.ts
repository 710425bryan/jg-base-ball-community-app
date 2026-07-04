import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSupabaseRpcAvailabilityCache } from '@/utils/supabaseRpc'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('dashboardAttendance service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseRpcAvailabilityCache()
  })

  it('normalizes today attendance status payloads', async () => {
    rpcMock.mockResolvedValue({
      data: {
        todayEvents: [
          { id: 'event-1', title: '', date: '2026-07-05', eventType: 'training' },
          { title: 'missing id' }
        ],
        todayLeaveNames: ['小明'],
        todayLeaveCount: '2'
      },
      error: null
    })

    const { getDashboardTodayAttendanceStatus } = await import('./dashboardAttendance')
    const result = await getDashboardTodayAttendanceStatus('2026-07-05')

    expect(rpcMock).toHaveBeenCalledWith('get_dashboard_today_attendance_status', {
      p_today: '2026-07-05'
    })
    expect(result.todayEvent).toEqual({
      id: 'event-1',
      title: '未命名點名單',
      date: '2026-07-05',
      eventType: 'training'
    })
    expect(result.todayEvents).toHaveLength(1)
    expect(result.todayLeaveCount).toBe(2)
  })

  it('returns and caches an empty status when the RPC is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'get_dashboard_today_attendance_status was not found'
      }
    })

    const { getDashboardTodayAttendanceStatus } = await import('./dashboardAttendance')

    expect(await getDashboardTodayAttendanceStatus('2026-07-05')).toMatchObject({
      todayEvent: null,
      todayEvents: [],
      todayLeaveNames: [],
      todayLeaveCount: 0
    })
    expect(await getDashboardTodayAttendanceStatus('2026-07-06')).toMatchObject({
      todayEvents: []
    })
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })
})
