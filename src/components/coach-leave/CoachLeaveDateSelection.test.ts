// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CoachLeaveDateSelection from './CoachLeaveDateSelection.vue'
import type { CoachLeaveClassDateLoader, CoachLeaveTrainingDates } from '@/types/coachLeaveDateSelection'
import { createCoachLeaveDateSelection } from '@/utils/coachLeaveDateSelection'

const response = (month: string): CoachLeaveTrainingDates => ({ month_start: `${month}-01`, programs: [
  { program_key: 'junior_high_school_team', program_label: '國中部', training_dates: [`${month}-08`] },
  { program_key: 'chunggang_school_team', program_label: '中港總部', training_dates: [`${month}-01`, `${month}-03`, `${month}-10`, `${month}-10`, 'bad'] }
] })
const stubs = {
  'el-form-item': { props: ['label'], template: '<div>{{ label }}<slot /></div>' },
  'el-radio-group': { name: 'ElRadioGroup', props: ['modelValue'], emits: ['update:modelValue'], template: '<div><slot /></div>' },
  'el-radio-button': true,
  'el-select': { name: 'ElSelect', props: ['modelValue'], emits: ['update:modelValue'], template: '<div><slot /></div>' },
  'el-option': true,
  'el-date-picker': { name: 'ElDatePicker', props: ['modelValue', 'disabledDate'], emits: ['update:modelValue'], template: '<div />' },
  'el-checkbox-group': { name: 'ElCheckboxGroup', props: ['modelValue'], emits: ['update:modelValue'], template: '<div><slot /></div>' },
  'el-checkbox-button': true,
  'el-button': { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' }
}
const createWrapper = (loader?: CoachLeaveClassDateLoader) => mount(CoachLeaveDateSelection, {
  props: { modelValue: createCoachLeaveDateSelection('2026-10-02'), open: true, loadClassDates: loader }, global: { stubs }
})

describe('CoachLeaveDateSelection', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-02T04:00:00Z')) })
  afterEach(() => vi.useRealTimers())

  it('loads this and next month, defaults to Chunggang, prevents past dates and preserves selection while appending months', async () => {
    const loader = vi.fn(async (month: string) => response(month))
    const wrapper = createWrapper(loader)
    await flushPromises()
    expect(loader.mock.calls.map(([month]) => month)).toEqual(['2026-10', '2026-11'])
    expect(wrapper.findComponent({ name: 'ElSelect' }).props('modelValue')).toBe('chunggang_school_team')
    expect(wrapper.find('[data-date="2026-10-01"]').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('[data-date="2026-10-10"]')).toHaveLength(1)
    await wrapper.find('[data-date="2026-10-03"]').trigger('click')
    const selected = wrapper.emitted('update:modelValue')!.at(-1)![0]
    await wrapper.setProps({ modelValue: selected as ReturnType<typeof createCoachLeaveDateSelection> })
    await wrapper.find('[data-test="load-next-training-month"]').trigger('click')
    await flushPromises()
    expect(loader).toHaveBeenLastCalledWith('2026-12')
    expect(wrapper.find('[data-date="2026-12-03"]').exists()).toBe(true)
    expect(wrapper.find('[data-date="2026-10-03"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-test="selected-training-dates"]').text()).toContain('已選 1 天')
    wrapper.unmount()
  })

  it('switches active program dates without using coach/player identity or clearing selected dates', async () => {
    const wrapper = createWrapper(async (month) => response(month))
    await flushPromises()
    await wrapper.setProps({ modelValue: { ...createCoachLeaveDateSelection('2026-10-02'), selectedDates: ['2026-10-03'] } })
    wrapper.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'junior_high_school_team')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-date="2026-10-08"]').exists()).toBe(true)
    expect(wrapper.find('[data-date="2026-10-03"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="selected-training-dates"]').text()).toContain('已選 1 天')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('retains successful months and selection when a later month fails, then retries that exact month', async () => {
    const loader = vi.fn(async (month: string) => response(month))
    const wrapper = createWrapper(loader)
    await flushPromises()
    await wrapper.setProps({ modelValue: { ...createCoachLeaveDateSelection('2026-10-02'), selectedDates: ['2026-10-03'] } })
    loader.mockRejectedValueOnce(new Error('offline'))
    await wrapper.find('[data-test="load-next-training-month"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('已選日期會保留')
    expect(wrapper.find('[data-date="2026-10-03"]').attributes('aria-pressed')).toBe('true')
    await wrapper.find('[data-test="retry-class-dates"]').trigger('click')
    await flushPromises()
    expect(loader).toHaveBeenLastCalledWith('2026-12')
    expect(wrapper.find('[data-date="2026-12-03"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="retry-class-dates"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('ignores late results after close and lets single, range and recurring controls update their independent draft', async () => {
    const finish: Record<string, (value: CoachLeaveTrainingDates) => void> = {}
    const wrapper = createWrapper((month) => new Promise((resolve) => { finish[month] = resolve }))
    await wrapper.setProps({ open: false })
    finish['2026-10']!(response('2026-10'))
    finish['2026-11']!(response('2026-11'))
    await flushPromises()
    expect(wrapper.find('[data-date="2026-11-03"]').exists()).toBe(false)
    await wrapper.setProps({ modelValue: { ...createCoachLeaveDateSelection('2026-10-02'), mode: 'single' } })
    wrapper.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', '2026-10-05')
    expect(wrapper.emitted('update:modelValue')!.at(-1)![0]).toMatchObject({ mode: 'single', singleDate: '2026-10-05' })
    await wrapper.setProps({ modelValue: { ...createCoachLeaveDateSelection('2026-10-02'), mode: 'recurring' } })
    wrapper.findComponent({ name: 'ElCheckboxGroup' }).vm.$emit('update:modelValue', [6, 0])
    expect(wrapper.emitted('update:modelValue')!.at(-1)![0]).toMatchObject({ recurringDays: [6, 0] })
    expect(wrapper.findAllComponents({ name: 'ElDatePicker' })).toHaveLength(2)
    expect(wrapper.text()).toContain('每次最多 365 筆，日期範圍最多 365 天')
    wrapper.unmount()
  })
})
