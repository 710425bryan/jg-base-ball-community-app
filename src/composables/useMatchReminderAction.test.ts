import { beforeEach, describe, expect, it, vi } from 'vitest'
import dayjs from 'dayjs'
import { useMatchReminderAction } from './useMatchReminderAction'
const mocks = vi.hoisted(() => ({ can: vi.fn(), confirm: vi.fn(), send: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn(), matches: [] as any[] }))
vi.mock('@/stores/matches', () => ({ useMatchesStore: () => ({ matches: mocks.matches }) }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: mocks.can }) }))
vi.mock('@/services/matchReminderNotifications', () => ({ sendMatchReminderNotification: mocks.send }))
vi.mock('@/utils/pushNotifications', () => ({ describePushDispatchIssue: () => null }))
vi.mock('element-plus', () => ({ ElMessage: { warning: mocks.warning, error: mocks.error, success: mocks.success }, ElMessageBox: { confirm: mocks.confirm } }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.can.mockReturnValue(true)
  mocks.confirm.mockResolvedValue(true)
  mocks.send.mockResolvedValue({ match_count: 1, created_count: 1 })
  mocks.matches = [{ id: 'm1', match_name: '交流賽', match_date: dayjs().add(1, 'day').format('YYYY-MM-DD') }]
})
describe('useMatchReminderAction', () => {
  it('blocks permission denied and cancelled games before confirmation', async () => {
    const action = useMatchReminderAction()
    mocks.can.mockReturnValue(false)
    await action.handleNotifyMatch('m1')
    mocks.can.mockReturnValue(true)
    mocks.matches[0].cancelled_at = '2026-10-12'
    await action.handleNotifyMatch('m1')
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('delivers a future reminder and clears loading', async () => {
    const action = useMatchReminderAction()
    await action.handleNotifyMatch('m1')
    expect(mocks.send).toHaveBeenCalledWith('m1')
    expect(mocks.success).toHaveBeenCalled()
    expect(action.notifyingMatchId.value).toBeNull()
  })
  it('treats duplicates as a warning and a dismissed confirmation as no send', async () => {
    const action = useMatchReminderAction()
    mocks.send.mockResolvedValueOnce({ match_count: 1, created_count: 0, duplicate_count: 1 })
    await action.handleNotifyMatch('m1')
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining('略過重複'))
    mocks.confirm.mockRejectedValueOnce('cancel')
    await action.handleNotifyMatch('m1')
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(action.notifyingMatchId.value).toBeNull()
  })
  it.each([
    { reason: 'cancelled', created: false, message: '賽事已取消' },
    { reason: 'cancelled', created: true, message: '賽事已取消' },
    { reason: 'unavailable', created: true, message: '無法確認賽事最新狀態' }
  ])('does not report a skipped dispatch as successful: $reason / $created', async ({ reason, created, message }) => {
    mocks.send.mockResolvedValueOnce({
      match_count: 1, created_count: Number(created), total_targets: 2, dispatched_count: 0,
      matches: [{ match_id: 'm1', skipped: true, created, reason }]
    })
    const action = useMatchReminderAction()
    await action.handleNotifyMatch('m1')
    expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining(message))
    expect(mocks.success).not.toHaveBeenCalled()
    expect(action.notifyingMatchId.value).toBeNull()
  })
})
