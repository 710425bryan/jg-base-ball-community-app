import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { useMatchStatusDialogs } from './useMatchStatusDialogs'
const mocks = vi.hoisted(() => ({ store: {} as any, can: vi.fn() }))
vi.mock('@/stores/matches', () => ({ useMatchesStore: () => mocks.store }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: mocks.can }) }))
beforeEach(() => {
  mocks.can.mockReturnValue(true)
  mocks.store = reactive({ matches: [
    { id: 'active', cancelled_at: null, match_level: '友誼賽' },
    { id: 'cancelled', cancelled_at: '2026-10-12', match_level: '友誼賽' },
    { id: 'training', cancelled_at: '2026-10-12', match_level: '特訓課' }
  ] })
})
describe('useMatchStatusDialogs', () => {
  it('opens only the action matching the current state, with one dialog at a time', () => {
    const dialogs = useMatchStatusDialogs()
    dialogs.handleCancelMatch('active')
    expect(dialogs.cancelDialogVisible.value).toBe(true)
    expect(dialogs.cancellationMatch.value?.id).toBe('active')
    dialogs.handleRestoreMatch('cancelled')
    expect(dialogs.cancelDialogVisible.value).toBe(false)
    expect(dialogs.restoreDialogVisible.value).toBe(true)
    expect(dialogs.restorationMatch.value?.id).toBe('cancelled')
    dialogs.restoreDialogVisible.value = false
    dialogs.handleRestoreMatch('active')
    dialogs.handleRestoreMatch('training')
    dialogs.handleRestoreMatch('missing')
    dialogs.handleCancelMatch('cancelled')
    expect(dialogs.restoreDialogVisible.value).toBe(false)
    expect(dialogs.cancelDialogVisible.value).toBe(false)
  })
  it('rechecks permissions and current state for every requested action', () => {
    const dialogs = useMatchStatusDialogs()
    mocks.can.mockReturnValue(false)
    dialogs.handleCancelMatch('active')
    dialogs.handleRestoreMatch('cancelled')
    expect(dialogs.restoreDialogVisible.value).toBe(false)
    expect(dialogs.cancelDialogVisible.value).toBe(false)
    mocks.can.mockReturnValue(true)
    mocks.store.matches[1].cancelled_at = null
    dialogs.handleRestoreMatch('cancelled')
    expect(dialogs.restoreDialogVisible.value).toBe(false)
  })
})
