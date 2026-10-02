// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import CoachLeaveRequestsView from './CoachLeaveRequestsView.vue'
import CoachLeaveRequestDialog from '@/components/coach-leave/CoachLeaveRequestDialog.vue'
import type { CoachLeaveRequest } from '@/types/coachLeaveRequest'

const mocks = vi.hoisted(() => ({
  list: vi.fn(), save: vi.fn(), createBatch: vi.fn(), trainingDates: vi.fn(), cancel: vi.fn(), confirm: vi.fn(),
  profile: { role: 'COACH', name: '王教練', id: 'coach-a', is_active: true } as Record<string, any>,
  can: vi.fn(), query: {} as Record<string, string>
}))
vi.mock('@/services/coachLeaveRequestsApi', () => ({ coachLeaveRequestsApi: mocks }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ profile: mocks.profile }) }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: mocks.can }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: mocks.query }) }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: mocks.confirm } }))

const leave: CoachLeaveRequest = {
  id: 'leave-a', coach_profile_id: 'coach-a', coach_name: '王教練', coach_nickname: null,
  start_date: '2026-10-02', end_date: '2026-10-02', time_segment: 'morning', reason: '私人原因', status: 'active',
  created_at: '2026-10-01', updated_at: '2026-10-01T00:00:00.123456Z'
}
const createWrapper = (manage = false) => shallowMount(CoachLeaveRequestsView, {
  props: { manage }, global: { stubs: {
    AppPageHeader: { template: '<header><slot name="actions" /></header>' },
    'el-button': { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
    'el-icon': true, 'el-date-picker': true,
    'el-select': { template: '<div><slot /></div>' },
    'el-option': { name: 'ElOption', props: ['label', 'value'], template: '<span>{{ label }}</span>' }
  } }
})

describe('CoachLeaveRequestsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T04:00:00Z'))
    mocks.profile = { role: 'COACH', name: '王教練', id: 'coach-a', is_active: true }
    mocks.query = {}
    mocks.can.mockReturnValue(true)
    mocks.list.mockResolvedValue({ leaves: [leave], coaches: [] })
    mocks.save.mockResolvedValue('leave-a')
    mocks.createBatch.mockResolvedValue(['leave-a', 'leave-b'])
    mocks.trainingDates.mockResolvedValue({ month_start: '2026-10-01', programs: [] })
    mocks.cancel.mockResolvedValue(undefined)
    mocks.confirm.mockResolvedValue('confirm')
  })
  afterEach(() => vi.useRealTimers())

  it('limits personal listing to own scope and does not load when a non-coach has bypass permissions', async () => {
    const wrapper = createWrapper()
    await flushPromises()
    expect(wrapper.classes()).toContain('coach-feature-theme')
    expect(mocks.list).toHaveBeenCalledWith({ month: '2026-10', status: 'all', coachProfileId: null, manage: false })
    wrapper.unmount()
    mocks.list.mockClear()
    mocks.profile.role = 'ADMIN'
    const adminWrapper = createWrapper()
    await flushPromises()
    expect(adminWrapper.find('[data-test="no-access"]').exists()).toBe(true)
    expect(mocks.list).not.toHaveBeenCalled()
    adminWrapper.unmount()
  })

  it('keeps whole-team manager visibility independent and makes VIEW-only cards read-only', async () => {
    mocks.profile.role = 'MANAGER'
    mocks.can.mockImplementation((feature, action) => feature === 'coach_leave_requests' && action === 'VIEW')
    const wrapper = createWrapper(true)
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ manage: true }))
    expect(wrapper.findAll('[data-test="coach-leave-card"]')).toHaveLength(1)
    expect(wrapper.find('[data-test="create-leave"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="edit-leave"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="cancel-leave"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('loads all months for a notification deep link and highlights its card', async () => {
    mocks.query = { highlight_leave_id: 'leave-a' }
    const wrapper = createWrapper(true)
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ month: null, status: 'all' }))
    expect(wrapper.find('[data-test="coach-leave-card"]').classes()).toContain('border-primary')
    wrapper.unmount()
  })

  it('lets managers filter historical coaches without adding them to the schedulable creation list', async () => {
    const wrapper = createWrapper(true)
    await flushPromises()
    expect(wrapper.findAllComponents({ name: 'ElOption' }).some((option) => option.props('label') === '王教練')).toBe(true)
    expect(wrapper.findComponent(CoachLeaveRequestDialog).props('coaches')).toEqual([])
    wrapper.unmount()
  })

  it('allows cancelling and editing ongoing leave while keeping fully ended history read-only', async () => {
    const ongoing = { ...leave, start_date: '2026-09-30', end_date: '2026-10-03', time_segment: 'full_day' }
    const ended = { ...leave, id: 'leave-ended', start_date: '2026-09-29', end_date: '2026-10-01' }
    mocks.list.mockResolvedValue({ leaves: [ongoing, ended], coaches: [] })
    const wrapper = createWrapper()
    await flushPromises()
    const cards = wrapper.findAll('[data-test="coach-leave-card"]')
    expect(cards[1]!.text()).toContain('已結束的歷史假單為唯讀')
    expect(cards[1]!.find('[data-test="cancel-leave"]').exists()).toBe(false)
    expect(cards[1]!.find('[data-test="edit-leave"]').exists()).toBe(false)
    await cards[0]!.find('[data-test="edit-leave"]').trigger('click')
    expect(wrapper.findComponent(CoachLeaveRequestDialog).props('leave')).toEqual(ongoing)
    expect(wrapper.findComponent(CoachLeaveRequestDialog).props('modelValue')).toBe(true)
    await cards[0]!.find('[data-test="cancel-leave"]').trigger('click')
    await flushPromises()
    expect(mocks.cancel).toHaveBeenCalledWith(ongoing.id, ongoing.updated_at, false)
    wrapper.unmount()
  })

  it('preserves the failed whole-batch form and refreshes once after a successful retry', async () => {
    const changed = vi.fn()
    window.addEventListener('coach-leave-changed', changed)
    const wrapper = createWrapper()
    await flushPromises()
    await wrapper.find('[data-test="create-leave"]').trigger('click')
    const dialog = wrapper.findComponent(CoachLeaveRequestDialog)
    const input = { records: [
      { start_date: '2026-10-02', end_date: '2026-10-02', time_segment: 'morning' },
      { start_date: '2026-10-09', end_date: '2026-10-09', time_segment: 'morning' }
    ], reason: '私人原因' }
    mocks.createBatch.mockRejectedValueOnce(new Error('已有重疊假單，請檢查日期。'))
    dialog.vm.$emit('create', input, 'retry-id')
    await flushPromises()
    expect(changed).not.toHaveBeenCalled()
    expect(dialog.props('serverError')).toContain('已有重疊假單')
    expect(dialog.props('modelValue')).toBe(true)
    dialog.vm.$emit('create', input, 'retry-id')
    await flushPromises()
    expect(changed).toHaveBeenCalledTimes(1)
    expect(mocks.createBatch).toHaveBeenLastCalledWith(input, false, 'retry-id')
    expect(mocks.save).not.toHaveBeenCalled()
    expect(dialog.props('modelValue')).toBe(false)
    wrapper.unmount(); window.removeEventListener('coach-leave-changed', changed)
  })

  it('loads coach-authorized quick dates and keeps edits on the versioned single-leave RPC', async () => {
    const wrapper = createWrapper(true)
    await flushPromises()
    const dialog = wrapper.findComponent(CoachLeaveRequestDialog)
    await dialog.props('loadClassDates')!('2026-11')
    expect(mocks.trainingDates).toHaveBeenCalledWith('2026-11', true)
    await wrapper.find('[data-test="edit-leave"]').trigger('click')
    dialog.vm.$emit('save', leave, null)
    await flushPromises()
    expect(mocks.save).toHaveBeenCalledWith(leave, true, null)
    expect(mocks.createBatch).not.toHaveBeenCalled()
    mocks.can.mockReturnValue(false)
    await wrapper.setProps({ manage: false })
    await expect(dialog.props('loadClassDates')!('2026-12')).rejects.toThrow('沒有查看')
    wrapper.unmount()
  })

  it('confirms cancellation, carries the exact revision, and preserves already-cancelled history', async () => {
    const wrapper = createWrapper(true)
    await flushPromises()
    mocks.confirm.mockRejectedValueOnce('cancel')
    await wrapper.find('[data-test="cancel-leave"]').trigger('click')
    await flushPromises()
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining('不會自動恢復已移除的教練指派'), '取消教練假單', expect.any(Object))
    const changed = vi.fn()
    window.addEventListener('coach-leave-changed', changed)
    mocks.cancel.mockRejectedValueOnce(new Error('stale revision'))
    await wrapper.find('[data-test="cancel-leave"]').trigger('click')
    await flushPromises()
    expect(changed).not.toHaveBeenCalled()
    mocks.list.mockResolvedValue({ leaves: [{ ...leave, status: 'cancelled' }], coaches: [] })
    await wrapper.find('[data-test="cancel-leave"]').trigger('click')
    await flushPromises()
    expect(mocks.cancel).toHaveBeenLastCalledWith('leave-a', leave.updated_at, true)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('已取消假單保留紀錄')
    expect(wrapper.find('[data-test="cancel-leave"]').exists()).toBe(false)
    wrapper.unmount(); window.removeEventListener('coach-leave-changed', changed)
  })
})
