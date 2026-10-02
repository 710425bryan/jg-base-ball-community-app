// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CoachLeaveRequestDialog from './CoachLeaveRequestDialog.vue'
import dialogSource from './CoachLeaveRequestDialog.vue?raw'
import type { CoachLeaveRequest } from '@/types/coachLeaveRequest'
import CoachLeaveDateSelection from './CoachLeaveDateSelection.vue'
import { createCoachLeaveDateSelection } from '@/utils/coachLeaveDateSelection'

const leave = {
  id: 'leave-a', coach_profile_id: 'coach-a', coach_name: '王教練', coach_nickname: null,
  start_date: '2026-10-02', end_date: '2026-10-02', time_segment: 'morning', reason: null,
  status: 'active', created_at: 'now', updated_at: '2026-10-02T00:00:00.123456Z'
} satisfies CoachLeaveRequest
const stubs = {
  CoachLeaveDateSelection: { name: 'CoachLeaveDateSelection', props: ['modelValue', 'error'], emits: ['update:modelValue'], template: '<div>{{ error }}</div>' },
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { props: ['label', 'error'], template: '<div>{{ label }}<span>{{ error }}</span><slot /></div>' },
  'el-select': { name: 'ElSelect', props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<div><slot /></div>' },
  'el-option': true,
  'el-date-picker': { name: 'ElDatePicker', props: ['modelValue', 'disabledDate'], emits: ['update:modelValue'], template: '<div />' },
  'el-input': { name: 'ElInput', props: ['modelValue'], emits: ['update:modelValue'], template: '<div />' },
  'el-button': { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' }
}
const createWrapper = (props = {}) => mount(CoachLeaveRequestDialog, {
  props: { modelValue: true, coaches: [{ id: 'coach-a', name: '王教練', nickname: null, role: 'COACH', avatar_url: null }], ownCoachName: '王教練', ...props },
  global: { stubs }
})

describe('CoachLeaveRequestDialog', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T04:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('locks self identity and keeps the same retry UUID on repeated submissions', async () => {
    const wrapper = createWrapper()
    expect(wrapper.find('[data-test="save-leave"]').text()).toBe('送出假單')
    expect(wrapper.classes()).toContain('coach-feature-theme')
    expect(wrapper.find('[data-test="fixed-coach"]').text()).toContain('王教練')
    expect(wrapper.text()).toContain('重疊時段的教練指派會移除')
    expect(wrapper.text()).toContain('取消假單不會自動恢復指派')
    expect(wrapper.findAllComponents({ name: 'ElSelect' })).toHaveLength(1)
    wrapper.findComponent(CoachLeaveDateSelection).vm.$emit('update:modelValue', { ...createCoachLeaveDateSelection('2026-10-02'), mode: 'single' })
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    const events = wrapper.emitted('create')!
    expect(events[0]?.[0]).toMatchObject({ records: [{ start_date: '2026-10-02', end_date: '2026-10-02', time_segment: 'full_day' }] })
    expect(events[0]?.[0]).not.toHaveProperty('coach_profile_id', 'coach-a')
    expect(events[0]?.[1]).toBe(events[1]?.[1])
    expect(events[0]?.[1]).toMatch(/^[0-9a-f-]{36}$/)
    wrapper.unmount()
  })

  it('requires an explicit coach when creating as manager and keeps it immutable during edit', async () => {
    const wrapper = createWrapper({ manage: true })
    wrapper.findComponent(CoachLeaveDateSelection).vm.$emit('update:modelValue', { ...createCoachLeaveDateSelection('2026-10-02'), mode: 'single' })
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.text()).toContain('請選擇教練')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true, leave })
    expect(wrapper.find('[data-test="save-leave"]').text()).toBe('儲存變更')
    expect(wrapper.findAllComponents({ name: 'ElSelect' })).toHaveLength(1)
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ coach_profile_id: 'coach-a', id: 'leave-a', updated_at: leave.updated_at })
    wrapper.unmount()
  })

  it('submits multiple quick-selected single dates with half-day segments and replaces retry UUID only when payload changes', async () => {
    const wrapper = createWrapper()
    expect(wrapper.findComponent(CoachLeaveDateSelection).props('modelValue').mode).toBe('quick')
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    expect(wrapper.emitted('create')).toBeUndefined()
    expect(wrapper.text()).toContain('請至少選擇一個請假日期')
    wrapper.findComponent(CoachLeaveDateSelection).vm.$emit('update:modelValue', { ...createCoachLeaveDateSelection('2026-10-02'), selectedDates: ['2026-10-10', '2026-10-03', '2026-10-03'] })
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'morning')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    let events = wrapper.emitted('create')!
    expect(events[0]?.[0]).toMatchObject({ records: [
      { start_date: '2026-10-03', end_date: '2026-10-03', time_segment: 'morning' },
      { start_date: '2026-10-10', end_date: '2026-10-10', time_segment: 'morning' }
    ] })
    expect(events[0]?.[1]).toBe(events[1]?.[1])
    wrapper.findComponent({ name: 'ElInput' }).vm.$emit('update:modelValue', '更正原因')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    events = wrapper.emitted('create')!
    expect(events[2]?.[1]).not.toBe(events[0]?.[1])
    expect(events[2]?.[0]).toHaveProperty('reason', '更正原因')
    wrapper.unmount()
  })

  it('forces full-day only for a multi-day create range while keeping single-day range segments selectable', async () => {
    const wrapper = createWrapper()
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'afternoon')
    wrapper.findComponent(CoachLeaveDateSelection).vm.$emit('update:modelValue', { ...createCoachLeaveDateSelection('2026-10-02'), mode: 'range', rangeEnd: '2026-10-03' })
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('disabled')).toBe(true)
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    expect(wrapper.emitted('create')?.[0]?.[0]).toMatchObject({ records: [{ start_date: '2026-10-02', end_date: '2026-10-03', time_segment: 'full_day' }] })
    wrapper.findComponent(CoachLeaveDateSelection).vm.$emit('update:modelValue', { ...createCoachLeaveDateSelection('2026-10-02'), mode: 'range' })
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('disabled')).toBe(false)
    wrapper.unmount()
  })

  it('turns a multi-day half-day leave into full-day and validates past dates locally', async () => {
    const wrapper = createWrapper({ leave })
    const dates = wrapper.findAllComponents({ name: 'ElDatePicker' })
    dates[1]!.vm.$emit('update:modelValue', '2026-10-03')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({ time_segment: 'full_day', end_date: '2026-10-03' })
    dates[0]!.vm.$emit('update:modelValue', '2026-10-01')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.text()).toContain('只可新增或修改今天起')
    wrapper.unmount()
  })

  it('edits only the remaining today-forward range of an ongoing leave and explains the retained audit', async () => {
    const wrapper = createWrapper({ leave: { ...leave, start_date: '2026-10-01', end_date: '2026-10-03', time_segment: 'full_day' } })
    expect(wrapper.find('[data-test="ongoing-leave-notice"]').text()).toContain('修改後只保留今天起的請假範圍')
    expect(wrapper.find('[data-test="ongoing-leave-notice"]').text()).toContain('原範圍保留於異動紀錄')
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({
      id: leave.id, start_date: '2026-10-02', end_date: '2026-10-03', time_segment: 'full_day', updated_at: leave.updated_at
    })
    expect(wrapper.emitted('save')?.[0]?.[1]).toBeNull()
    wrapper.unmount()
  })

  it('blocks repeated submissions while saving and makes 640–767px dialogs scroll with safe close/footer areas', async () => {
    const wrapper = createWrapper({ saving: true })
    await wrapper.find('[data-test="save-leave"]').trigger('click')
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(dialogSource).toContain('@media (max-width: 767px)')
    expect(dialogSource).toContain('width: 44px; height: 44px')
    expect(dialogSource).toContain('env(safe-area-inset-top)')
    expect(dialogSource).toContain('env(safe-area-inset-bottom)')
    expect(dialogSource).toContain('overflow-y: auto')
    wrapper.unmount()
  })
})
