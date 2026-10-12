// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SyncCalendarDialog from './SyncCalendarDialog.vue'

const mocks = vi.hoisted(() => ({
  store: { matches: [] as any[], createMatch: vi.fn(), updateMatch: vi.fn(), fetchMatch: vi.fn(), fetchMatches: vi.fn() },
  success: vi.fn(), error: vi.fn()
}))
vi.mock('@/stores/matches', () => ({ useMatchesStore: () => mocks.store }))
vi.mock('@/services/supabase', () => ({ supabase: {} }))
vi.mock('@/services/matchCalendarSync', () => ({ fetchCalendarSyncPlan: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success, error: mocks.error } }))

const makeItem = (action: 'create' | 'update' | 'skip', id: string) => ({
  action, existingMatchId: action === 'create' ? null : id,
  payload: { match_name: id, match_date: '2026-10-18', match_time: '09:00 - 11:00', location: '原球場' },
  parsedMatch: { id, title: id }, scheduleDiffs: [], validationIssues: [], isBlocked: false,
  playerCheck: { total: 0, matched: 0, needsReview: 0, items: [] }
})
const render = (items = [makeItem('update', 'm1'), makeItem('update', 'm2'), makeItem('create', 'm3')]) => {
  const wrapper = mount(SyncCalendarDialog, {
    props: { modelValue: true },
    global: { stubs: {
      ElDialog: { template: '<section><slot /><slot name="footer" /></section>' },
      ElInput: true, ElButton: { template: '<button><slot /></button>' }
    } }
  })
  ;(wrapper.vm as any).syncItems = items
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.store.matches = []
  mocks.store.createMatch.mockResolvedValue({ id: 'm3' })
  mocks.store.updateMatch.mockResolvedValue({ id: 'm2' })
  mocks.store.fetchMatches.mockResolvedValue([])
})

describe('SyncCalendarDialog cancellation protection', () => {
  it('skips a cancelled match in an old preview and continues the remaining batch', async () => {
    mocks.store.matches = [{ id: 'm1', cancelled_at: '2026-10-12T03:00:00Z', location: '原球場' }]
    const wrapper = render()
    await (wrapper.vm as any).handleConfirmSync()
    expect(mocks.store.updateMatch).toHaveBeenCalledTimes(1)
    expect(mocks.store.updateMatch).toHaveBeenCalledWith('m2', expect.any(Object), { requireActive: true })
    expect(mocks.store.createMatch).toHaveBeenCalledTimes(1)
    expect(mocks.success).toHaveBeenCalledWith('同步完成：新增 1 筆，更新 1 筆，略過 1 筆')
    expect(mocks.error).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('已取消賽事')
  })

  it('continues when the atomic update loses a race to cancellation', async () => {
    mocks.store.updateMatch.mockRejectedValueOnce(Object.assign(new Error('資料已異動'), { code: 'PGRST116' }))
    mocks.store.fetchMatch.mockResolvedValueOnce({ id: 'm1', cancelled_at: '2026-10-12T03:00:00Z' })
    const wrapper = render()
    await (wrapper.vm as any).handleConfirmSync()
    expect(mocks.store.fetchMatch).toHaveBeenCalledWith('m1', { force: true })
    expect(mocks.store.updateMatch).toHaveBeenCalledTimes(2)
    expect(mocks.store.createMatch).toHaveBeenCalledTimes(1)
    expect(mocks.success).toHaveBeenCalledWith('同步完成：新增 1 筆，更新 1 筆，略過 1 筆')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it.each(['active', 'unavailable'])('does not disguise a zero-row update as cancellation when latest state is %s', async state => {
    mocks.store.updateMatch.mockRejectedValueOnce(Object.assign(new Error('資料已異動'), { code: 'PGRST116' }))
    if (state === 'active') mocks.store.fetchMatch.mockResolvedValueOnce({ id: 'm1', cancelled_at: null })
    else mocks.store.fetchMatch.mockRejectedValueOnce(new Error('讀取失敗'))
    const wrapper = render()
    await (wrapper.vm as any).handleConfirmSync()
    expect(mocks.error).toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.store.createMatch).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('keeps permission/network errors visible and never retries them as cancellation', async () => {
    mocks.store.updateMatch.mockRejectedValueOnce(Object.assign(new Error('權限不足'), { code: '42501' }))
    const wrapper = render()
    await (wrapper.vm as any).handleConfirmSync()
    expect(mocks.error).toHaveBeenCalledWith('同步失敗：權限不足')
    expect(mocks.store.fetchMatch).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })
})
