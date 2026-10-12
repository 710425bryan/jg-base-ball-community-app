// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchCancelDialog from './MatchCancelDialog.vue'

const mocks = vi.hoisted(() => ({ cancelMatch: vi.fn(), can: vi.fn(), success: vi.fn() }))
vi.mock('@/stores/matches', () => ({ useMatchesStore: () => ({ cancelMatch: mocks.cancelMatch }) }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: mocks.can }) }))
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success } }))
const match = { id: 'm1', match_name: '交流賽', match_date: '2026-10-17', match_time: '09:00–11:00', note: '集合時間：08:30', updated_at: '2026-10-12T00:00:00Z' } as any
const mountDialog = (overrides = {}) => mount(MatchCancelDialog, {
  props: { modelValue: true, match: { ...match, ...overrides } },
  global: { stubs: {
    ElDialog: { template: '<div><slot/><slot name="footer"/></div>' },
    ElForm: { template: '<form><slot/></form>' }, ElFormItem: { template: '<div><slot/></div>' },
    ElSelect: true, ElOption: true, ElInput: true,
    ElButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' },
    MatchScheduleInfo: true
  } }
})
beforeEach(() => { vi.clearAllMocks(); mocks.can.mockReturnValue(true); mocks.cancelMatch.mockReset() })

describe('MatchCancelDialog', () => {
  it('requires a reason and details for Other without issuing a request', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any
    await vm.submit()
    expect(wrapper.get('[role="alert"]').text()).toContain('請選擇取消原因')
    vm.reason = '其他'
    await vm.submit()
    expect(mocks.cancelMatch).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('retains the entered reason on failure and merges the confirmed cancelled row on retry', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as any
    vm.reason = '天候不佳'
    vm.explanation = '場地積水'
    mocks.cancelMatch.mockRejectedValueOnce(new Error('網路錯誤'))
    await vm.submit()
    expect(wrapper.get('[role="alert"]').text()).toBe('網路錯誤')
    expect(vm.explanation).toBe('場地積水')
    expect(wrapper.emitted('cancelled')).toBeUndefined()
    const result = { ...match, cancelled_at: '2026-10-12', cancellation_reason: '天候不佳：場地積水' }
    mocks.cancelMatch.mockResolvedValueOnce(result)
    await vm.submit()
    expect(mocks.cancelMatch).toHaveBeenLastCalledWith('m1', '天候不佳：場地積水', match.updated_at)
    expect(wrapper.emitted('cancelled')?.[0]).toEqual([result])
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    wrapper.unmount()
  })
  it('prevents duplicate submissions and closing while saving', async () => {
    let resolve!: (value: unknown) => void
    mocks.cancelMatch.mockReturnValue(new Promise((done) => { resolve = done }))
    const wrapper = mountDialog()
    const vm = wrapper.vm as any
    vm.reason = '場地無法使用'
    const pending = vm.submit()
    await vm.submit()
    vm.close()
    expect(mocks.cancelMatch).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    resolve({ ...match, cancelled_at: '2026-10-12' })
    await pending
    await flushPromises()
    expect(vm.saving).toBe(false)
    wrapper.unmount()
  })
  it.each([{ cancelled_at: '2026-10-12' }, { match_level: '特訓課' }])('rejects unavailable match %j', async (overrides) => {
    const wrapper = mountDialog(overrides)
    ;(wrapper.vm as any).reason = '天候不佳'
    await (wrapper.vm as any).submit()
    expect(mocks.cancelMatch).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('rechecks permission at submit and uses the opened snapshot version', async () => {
    mocks.can.mockReturnValue(false)
    const wrapper = mountDialog()
    await (wrapper.vm as any).submit()
    expect(mocks.cancelMatch).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('沒有編輯權限')
    wrapper.unmount()
  })
  it('does not cancel with a missing version', async () => {
    const wrapper = mountDialog({ updated_at: undefined })
    ;(wrapper.vm as any).reason = '天候不佳'
    await (wrapper.vm as any).submit()
    expect(mocks.cancelMatch).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toContain('版本資料不足')
  })
  it('keeps the original version and entered reason if the row changes while confirmation is open', async () => {
    const wrapper = mountDialog()
    ;(wrapper.vm as any).reason = '天候不佳'
    await wrapper.setProps({ match: { ...match, updated_at: '2026-10-12T03:00:00Z' } })
    mocks.cancelMatch.mockResolvedValue({ ...match, cancelled_at: '2026-10-12' })
    await (wrapper.vm as any).submit()
    expect(mocks.cancelMatch).toHaveBeenCalledWith('m1', '天候不佳', match.updated_at)
  })
})
