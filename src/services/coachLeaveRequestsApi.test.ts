import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSession: vi.fn() }))
vi.mock('@/services/supabase', () => ({ supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } } }))
import { coachLeaveRequestsApi } from './coachLeaveRequestsApi'

const input = { start_date: '2026-10-02', end_date: '2026-10-02', time_segment: 'full_day' as const, reason: ' 原因 ' }
describe('coachLeaveRequestsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'test-only' } }, error: null })
    mocks.rpc.mockResolvedValue({ data: null, error: null })
  })

  it('lists safe RPC data and ignores forged self-mode coach targets', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { leaves: [{ id: 'leave-a', coach_profile_id: 'coach-a' }], coaches: [] }, error: null })
    const result = await coachLeaveRequestsApi.list({ month: '2026-10', coachProfileId: 'forged', manage: false })
    expect(result.leaves[0]?.coach_profile_id).toBe('coach-a')
    expect(mocks.rpc).toHaveBeenCalledWith('list_coach_leave_requests', { p_month: '2026-10-01', p_status: 'all', p_coach_profile_id: null, p_manage: false })
    await coachLeaveRequestsApi.list({ month: null, coachProfileId: 'coach-b', status: 'cancelled', manage: true })
    expect(mocks.rpc).toHaveBeenLastCalledWith('list_coach_leave_requests', { p_month: null, p_status: 'cancelled', p_coach_profile_id: 'coach-b', p_manage: true })
  })

  it('omits coach identity from self saves and preserves create retry keys', async () => {
    await coachLeaveRequestsApi.save({ ...input, coach_profile_id: 'forged' }, false, 'retry-key')
    expect(mocks.rpc).toHaveBeenCalledWith('save_coach_leave_request', {
      p_leave: { id: null, updated_at: null, ...input, reason: '原因' }, p_manage: false, p_request_id: 'retry-key'
    })
  })

  it('sends the whole date batch once, strips forged self identity and preserves its retry ID', async () => {
    const records = [input, { ...input, start_date: '2026-10-09', end_date: '2026-10-09', time_segment: 'morning' as const }]
    mocks.rpc.mockResolvedValue({ data: ['leave-a', 'leave-b'], error: null })
    const draft = { coach_profile_id: 'forged', records, reason: ' 原因 ' }
    expect(await coachLeaveRequestsApi.createBatch(draft, false, 'batch-id')).toEqual(['leave-a', 'leave-b'])
    const expected = {
      p_leaves: records.map(({ start_date, end_date, time_segment }) => ({ start_date, end_date, time_segment, reason: '原因' })),
      p_manage: false, p_batch_id: 'batch-id'
    }
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_coach_leave_requests', expected)
    await coachLeaveRequestsApi.createBatch(draft, false, 'batch-id')
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_coach_leave_requests', expected)
    await coachLeaveRequestsApi.createBatch({ ...draft, coach_profile_id: 'coach-a' }, true, 'manager-batch')
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_coach_leave_requests', {
      ...expected, p_manage: true, p_batch_id: 'manager-batch',
      p_leaves: expected.p_leaves.map((record) => ({ ...record, coach_profile_id: 'coach-a' }))
    })
  })

  it('loads only valid date metadata and rejects invalid month or unknown batch outcomes', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { programs: [
      { program_key: 'chunggang', program_label: '中港總部', note: '不得帶入表單', training_dates: ['2026-10-31', '2026-10-03', '2026-10-03', '2026-11-07', '2026-10-32', null] },
      { program_key: 'chunggang', training_dates: ['2026-10-09'] }, null, { program_key: '' }
    ] }, error: null })
    expect(await coachLeaveRequestsApi.trainingDates('2026-10', true)).toEqual({ month_start: '2026-10-01', programs: [
      { program_key: 'chunggang', program_label: '中港總部', training_dates: ['2026-10-03', '2026-10-31'] }
    ] })
    expect(mocks.rpc).toHaveBeenLastCalledWith('list_coach_leave_training_dates', { p_month: '2026-10-01', p_manage: true })
    mocks.rpc.mockClear()
    await expect(coachLeaveRequestsApi.trainingDates('2026-13')).rejects.toThrow('有效的月份')
    expect(mocks.rpc).not.toHaveBeenCalled()
    await expect(coachLeaveRequestsApi.createBatch({ records: [input] }, false, 'batch-id')).rejects.toThrow('保留表單並重試')
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'overlapping active coach leave' } })
    await expect(coachLeaveRequestsApi.createBatch({ records: [input] }, false, 'batch-id')).rejects.toThrow('overlapping')
  })

  it('sends immutable management identity and exact revision for edit/cancel', async () => {
    const revision = '2026-10-02T06:00:00.123456+00:00'
    await coachLeaveRequestsApi.save({ ...input, id: 'leave-a', updated_at: revision, coach_profile_id: 'coach-a' }, true, 'ignored')
    expect(mocks.rpc).toHaveBeenLastCalledWith('save_coach_leave_request', {
      p_leave: { ...input, reason: '原因', id: 'leave-a', updated_at: revision, coach_profile_id: 'coach-a' }, p_manage: true, p_request_id: null
    })
    await coachLeaveRequestsApi.cancel('leave-a', revision, true)
    expect(mocks.rpc).toHaveBeenLastCalledWith('cancel_coach_leave_request', { p_leave_id: 'leave-a', p_updated_at: revision, p_manage: true })
  })

  it('stops without a session and propagates permission/stale errors', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    await expect(coachLeaveRequestsApi.list()).rejects.toThrow('重新登入')
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
    await expect(coachLeaveRequestsApi.createBatch({ records: [input] }, false, 'batch-id')).rejects.toThrow('重新登入')
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'stale updated_at' } })
    await expect(coachLeaveRequestsApi.cancel('leave-a', 'old')).rejects.toThrow('重新整理')
  })
})
