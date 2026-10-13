import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('@/services/supabase', () => ({ supabase: { from: mocks.from } }))
import { listAttendanceEvents } from './attendanceEvents'

function query(result: object) {
  const chain: Record<string, any> = {}
  for (const method of ['select', 'gte', 'lt', 'order', 'in', 'neq', 'or', 'returns']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: object) => void) => Promise.resolve(result).then(resolve)
  return chain
}
const event = (overrides = {}) => ({
  id: 'event-1', title: '週六練球', date: '2026-10-03', event_type: '練習',
  profiles: { name: '王教練', nickname: '教練' },
  training_location_session_id: null, training_location_session_venue_id: null,
  attendance_records: [], ...overrides
})

describe('listAttendanceEvents', () => {
  beforeEach(() => vi.clearAllMocks())
  it.each([
    ['2026-10', '2026-10-01', '2026-11-01'],
    ['2026-12', '2026-12-01', '2027-01-01'],
    ['2024-02', '2024-02-01', '2024-03-01'],
    ['2025-02', '2025-02-01', '2025-03-01']
  ])('restricts %s in the database before fetching related records', async (month, start, end) => {
    const eventsQuery = query({ data: [], error: null })
    const membersQuery = query({ count: 25, error: null })
    mocks.from.mockImplementation((table) => table === 'attendance_events' ? eventsQuery : membersQuery)
    expect(await listAttendanceEvents(month!)).toEqual([])
    expect(eventsQuery.gte).toHaveBeenCalledWith('date', start)
    expect(eventsQuery.lt).toHaveBeenCalledWith('date', end)
    expect(eventsQuery.order.mock.calls).toEqual([
      ['date', { ascending: false }], ['created_at', { ascending: false }]
    ])
    expect(eventsQuery.select).toHaveBeenCalledWith(expect.stringContaining('attendance_records(status)'))
    expect(membersQuery.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(membersQuery.in).toHaveBeenCalledWith('role', ['球員', '校隊'])
    expect(membersQuery.neq).toHaveBeenCalledWith('status', '退隊')
    expect(membersQuery.or).toHaveBeenCalledWith('fee_billing_mode.is.null,fee_billing_mode.neq.no_fee')
  })
  it.each(['', '2026', '2026-00', '2026-13', '2026-1', '2026-10-01'])('rejects invalid month %s without a query', async (month) => {
    await expect(listAttendanceEvents(month)).rejects.toThrow('請選擇有效的查詢月份')
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('preserves attendance counts and the venue-only roster boundary', async () => {
    const records = ['出席', '遲到', '早退', '請假', '缺席'].map((status) => ({ status }))
    mocks.from.mockImplementation((table) => table === 'attendance_events'
      ? query({ data: [
        event({ attendance_records: records }),
        event({ id: 'venue', training_location_session_venue_id: 'venue', attendance_records: records }),
        event({ id: 'session', training_location_session_id: 'session', attendance_records: null }),
        event({ id: 'empty', attendance_records: null })
      ], error: null })
      : query({ count: 25, error: null }))
    const result = await listAttendanceEvents('2026-10')
    expect(result[0]).toMatchObject({ presentCount: 3, leaveCount: 1, absentCount: 1, totalCount: 25 })
    expect(result[1]).toMatchObject({ presentCount: 3, leaveCount: 1, absentCount: 1, totalCount: 5 })
    expect(result[2]).toMatchObject({ presentCount: 0, leaveCount: 0, absentCount: 0, totalCount: 0 })
    expect(result[3]).toMatchObject({ presentCount: 0, leaveCount: 0, absentCount: 0, totalCount: 25 })
  })
  it.each(['attendance_events', 'team_members'])('propagates %s errors instead of returning misleading counts', async (failedTable) => {
    mocks.from.mockImplementation((table) => query({
      data: [], count: 0, error: table === failedTable ? new Error('無法讀取') : null
    }))
    await expect(listAttendanceEvents('2026-10')).rejects.toThrow('無法讀取')
  })
})
