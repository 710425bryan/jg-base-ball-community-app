// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchRestoreDialog from './MatchRestoreDialog.vue'
import type { MatchRecord } from '@/types/match'

const mocks = vi.hoisted(() => ({ restoreMatch: vi.fn(), can: vi.fn(), success: vi.fn() }))
vi.mock('@/stores/matches', () => ({ useMatchesStore: () => ({ restoreMatch: mocks.restoreMatch }) }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: mocks.can }) }))
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success } }))

const match = {
  id: 'm1', match_name: '交流賽', opponent: '測試國小', match_date: '2026-10-17', match_time: '09:00–11:00',
  note: '集合時間：08:30', location: '測試球場', updated_at: '2026-10-12T00:00:00Z',
  cancelled_at: '2026-10-11T00:00:00Z', cancellation_reason: '誤判場地積水', match_level: '友誼賽'
} as MatchRecord
const restored = { ...match, cancelled_at: null, cancellation_reason: null, updated_at: '2026-10-12T01:00:00Z' }
const mountDialog = (overrides: Partial<MatchRecord> = {}) => mount(MatchRestoreDialog, {
  props: { modelValue: true, match: { ...match, ...overrides } },
  global: { stubs: {
    ElDialog: { props: ['modelValue'], template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>' },
    ElIcon: { template: '<span><slot/></span>' },
    ElButton: { props: ['disabled', 'loading'], template: '<button :disabled="disabled"><slot/></button>' }
  } }
})
beforeEach(() => { vi.clearAllMocks(); mocks.can.mockReturnValue(true); mocks.restoreMatch.mockReset() })

describe('MatchRestoreDialog', () => {
  it('shows the exact cancelled schedule, reason and recovery consequences without writing on open or return', async () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('誤判場地積水')
    expect(wrapper.text()).toContain('2026-10-17')
    expect(wrapper.text()).toContain('08:30')
    expect(wrapper.text()).toContain('後續行事曆同步')
    expect(wrapper.text()).toContain('不會立即發送推播')
    expect(wrapper.text()).toContain('比賽費需重新確認並開放繳費')
    expect(wrapper.text()).toContain('原教練排班資料會保留')
    await wrapper.findAll('button').find(button => button.text() === '返回')!.trigger('click')
    expect(mocks.restoreMatch).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('preserves the opened snapshot through background updates, failure and retry', async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ match: { ...match, cancellation_reason: '另一人的更新', updated_at: '2026-10-12T00:30:00Z' } })
    expect(wrapper.text()).toContain('誤判場地積水')
    expect(wrapper.text()).not.toContain('另一人的更新')
    mocks.restoreMatch.mockRejectedValueOnce(new Error('賽事資料已更新，請重新整理後再恢復'))
    await (wrapper.vm as any).submit()
    expect(wrapper.get('[role="alert"]').text()).toContain('賽事資料已更新')
    expect(wrapper.emitted('restored')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    mocks.restoreMatch.mockResolvedValueOnce(restored)
    await (wrapper.vm as any).submit()
    expect(mocks.restoreMatch.mock.calls).toEqual([['m1', match.updated_at], ['m1', match.updated_at]])
    expect(wrapper.emitted('restored')).toEqual([[restored]])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(mocks.success).toHaveBeenCalledWith('已恢復比賽')
  })

  it('prevents duplicate confirmation and closing while saving', async () => {
    let resolve!: (value: MatchRecord) => void
    mocks.restoreMatch.mockReturnValue(new Promise(done => { resolve = done }))
    const wrapper = mountDialog()
    const vm = wrapper.vm as any
    const pending = vm.submit()
    await vm.submit()
    vm.close()
    expect(mocks.restoreMatch).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    resolve(restored)
    await pending
    await flushPromises()
    expect(vm.saving).toBe(false)
  })

  it.each([{ cancelled_at: null }, { match_level: '特訓課' }])('refuses an ineligible game %j', async overrides => {
    const wrapper = mountDialog(overrides)
    await (wrapper.vm as any).submit()
    expect(mocks.restoreMatch).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('無法恢復')
  })

  it('rechecks revoked edit permission when confirming', async () => {
    const wrapper = mountDialog()
    mocks.can.mockReturnValue(false)
    await (wrapper.vm as any).submit()
    expect(mocks.restoreMatch).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('沒有編輯權限')
  })

  it('does not send a versionless restore and explains how to retry', async () => {
    const wrapper = mountDialog({ updated_at: undefined })
    expect(wrapper.get('[role="alert"]').text()).toContain('重新整理頁面')
    expect(wrapper.findAll('button').find(button => button.text() === '確認恢復比賽')!.attributes('disabled')).toBeDefined()
    await (wrapper.vm as any).submit()
    expect(mocks.restoreMatch).not.toHaveBeenCalled()
  })

  it('captures the latest row when reopened', async () => {
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true, match: { ...match, updated_at: '2026-10-12T02:00:00Z', cancellation_reason: '最新原因' } })
    mocks.restoreMatch.mockResolvedValueOnce(restored)
    await (wrapper.vm as any).submit()
    expect(wrapper.text()).toContain('最新原因')
    expect(mocks.restoreMatch).toHaveBeenCalledWith('m1', '2026-10-12T02:00:00Z')
  })
})
