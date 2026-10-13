// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import AttendanceListView from './AttendanceListView.vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), can: vi.fn(), push: vi.fn(), from: vi.fn(),
  confirm: vi.fn(), eq: vi.fn(), error: vi.fn()
}))
vi.mock('@/services/attendanceEvents', () => ({ listAttendanceEvents: mocks.list }))
vi.mock('@/services/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'user-1' } }) }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: mocks.can }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: mocks.error }, ElMessageBox: { confirm: mocks.confirm } }))

const event = {
  id: 'event-1', title: '十月練球', date: '2026-10-03', event_type: '練習',
  profiles: { name: '王教練', nickname: '教練' },
  presentCount: 3, leaveCount: 1, absentCount: 2, totalCount: 25
}
const createWrapper = () => shallowMount(AttendanceListView, {
  global: { stubs: {
    ViewModeSwitch: false,
    AppPageHeader: { template: '<header><slot name="actions" /></header>' },
    'el-button': { template: '<button><slot /></button>' },
    'el-icon': true,
    'el-date-picker': { name: 'ElDatePicker', props: ['modelValue', 'type', 'clearable'], template: '<div />' },
    'el-dialog': true, 'el-input': true, 'el-form-item': true,
    'el-option': true, 'el-select': true, 'el-form': true
  } }
})
const monthPicker = (wrapper: ReturnType<typeof createWrapper>) => wrapper.findComponent({ name: 'ElDatePicker' })
const button = (wrapper: ReturnType<typeof createWrapper>, text: string) => wrapper.findAll('button').find((item) => item.text() === text)!

describe('AttendanceListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // UTC is still September; the default must follow Taiwan's October.
    vi.setSystemTime(new Date('2026-09-30T16:01:00Z'))
    mocks.can.mockReturnValue(true)
    mocks.list.mockResolvedValue([event])
    mocks.confirm.mockResolvedValue('confirm')
    mocks.eq.mockResolvedValue({ error: null })
    mocks.from.mockReturnValue({ delete: () => ({ eq: mocks.eq }) })
  })
  afterEach(() => vi.useRealTimers())

  it('loads only the current Taiwan month and defaults to cards', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith('2026-10')
    expect(monthPicker(wrapper).props()).toMatchObject({ modelValue: '2026-10', type: 'month', clearable: false })
    expect(wrapper.find('[data-test="attendance-cards"]').text()).toContain(event.title)
    expect(wrapper.find('[data-test="attendance-table"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('共 1 筆')
    wrapper.unmount()
  })

  it('switches between equivalent cards and table without reloading or losing the month', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    monthPicker(wrapper).vm.$emit('update:modelValue', '2026-09')
    await flushPromises()
    await button(wrapper, '表格').trigger('click')
    const cells = wrapper.findAll('tbody tr > *').map((cell) => cell.text())
    expect(cells.slice(0, 8)).toEqual(['2026-10-03', '十月練球', '練習', '25', '3', '1', '2', '教練'])
    expect(button(wrapper, '表格').attributes('aria-pressed')).toBe('true')
    await button(wrapper, '開始點名').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/attendance/event-1')
    await button(wrapper, '卡片').trigger('click')
    await button(wrapper, '開始點名').trigger('click')
    expect(mocks.push).toHaveBeenCalledTimes(2)
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(monthPicker(wrapper).props('modelValue')).toBe('2026-09')
    await button(wrapper, '回到本月').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith('2026-10')
    wrapper.unmount()
  })

  it('ignores a slow previous month response and keeps loading the latest request', async () => {
    let resolveOld!: (value: typeof event[]) => void
    let resolveNew!: (value: typeof event[]) => void
    mocks.list.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve }))
    const wrapper = createWrapper()
    monthPicker(wrapper).vm.$emit('update:modelValue', '2026-11')
    await flushPromises()
    resolveOld([event])
    await flushPromises()
    expect(wrapper.findComponent({ name: 'AppLoadingState' }).exists()).toBe(true)
    expect(wrapper.text()).not.toContain(event.title)
    resolveNew([{ ...event, title: '十一月練球', date: '2026-11-07' }])
    await flushPromises()
    expect(wrapper.text()).toContain('十一月練球')
    expect(wrapper.text()).not.toContain(event.title)
    wrapper.unmount()
  })

  it('keeps a late previous request failure from replacing the latest result', async () => {
    let rejectOld!: (error: Error) => void
    mocks.list.mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject }))
    const wrapper = createWrapper()
    monthPicker(wrapper).vm.$emit('update:modelValue', '2026-11')
    await flushPromises()
    rejectOld(new Error('過期錯誤'))
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(event.title)
    wrapper.unmount()
  })

  it('clears old data on failure, retries the selected month, and explains an empty month', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    mocks.list.mockRejectedValueOnce(new Error('連線中斷'))
    monthPicker(wrapper).vm.$emit('update:modelValue', '2026-09')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('連線中斷')
    expect(wrapper.text()).not.toContain(event.title)
    mocks.list.mockResolvedValueOnce([])
    await button(wrapper, '重新載入').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith('2026-09')
    expect(wrapper.text()).toContain('所選月份尚無點名紀錄')
    expect(wrapper.text()).toContain('共 0 筆')
    wrapper.unmount()
  })

  it.each(['卡片', '表格'])('preserves deletion confirmation and refreshes the selected month in %s mode', async (mode) => {
    const wrapper = createWrapper()
    await flushPromises()
    monthPicker(wrapper).vm.$emit('update:modelValue', '2025-12')
    await flushPromises()
    await button(wrapper, mode).trigger('click')
    mocks.confirm.mockRejectedValueOnce('cancel')
    await wrapper.find('[aria-label="刪除點名單"]').trigger('click')
    await flushPromises()
    expect(mocks.eq).not.toHaveBeenCalled()
    await wrapper.find('[aria-label="刪除點名單"]').trigger('click')
    await flushPromises()
    expect(mocks.eq).toHaveBeenCalledWith('id', event.id)
    expect(mocks.list).toHaveBeenLastCalledWith('2025-12')
    expect(mocks.push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps create/delete permissions in both layouts', async () => {
    mocks.can.mockReturnValue(false)
    const wrapper = createWrapper()
    await flushPromises()
    expect(button(wrapper, '建立點名單')).toBeUndefined()
    expect(wrapper.find('[aria-label="刪除點名單"]').exists()).toBe(false)
    await button(wrapper, '表格').trigger('click')
    expect(wrapper.find('[aria-label="刪除點名單"]').exists()).toBe(false)
    expect(button(wrapper, '開始點名')).toBeDefined()
    wrapper.unmount()
  })
})
