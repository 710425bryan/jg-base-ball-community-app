// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import type { ComponentPublicInstance } from 'vue'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { normalizeCoachScheduleEvent } from '@/utils/coachSchedules'
import CoachScheduleMonthOverview from './CoachScheduleMonthOverview.vue'

const events = [
  normalizeCoachScheduleEvent({ id: 'match', source_type: 'match', source_id: 'match-source', schedule_date: '2026-10-31', title: '月底比賽',
    start_time: '15:00', end_time: '17:00', location: '河濱球場', status: 'cancelled' }),
  normalizeCoachScheduleEvent({ id: 'saved', source_type: 'training_location', source_id: 'session', source_venue_id: 'block', schedule_date: '2026-10-01',
    title: '月初訓練', start_time: '09:00', end_time: '12:00', location: '中港國小', coach_profile_ids: ['a'],
    assignments: [{ coach_profile_id: 'a', coach_name: '甲教練', coach_nickname: '阿甲' }] }),
  normalizeCoachScheduleEvent({ source_type: 'training_date', schedule_date: '2026-10-03', title: '週六訓練', start_time: null,
    coach_profile_ids: ['draft'], assignments: [{ coach_profile_id: 'draft', coach_name: '不應顯示的草稿' }] })
]
const create = (overrides: Partial<InstanceType<typeof CoachScheduleMonthOverview>['$props']> = {}) => shallowMount(CoachScheduleMonthOverview, {
  props: { modelValue: true, month: '2026-10', events, hasUnsavedChanges: false, ...overrides },
  global: { renderStubDefaultSlot: true, stubs: { AppDialogFooter: false, 'el-button': true,
    'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' } } }
})

describe('CoachScheduleMonthOverview', () => {
  it('renders a compact chronological full-month list with source, time, venue and saved coaches', () => {
    const wrapper = create()
    expect(wrapper.classes()).toContain('coach-feature-theme')
    expect(wrapper.classes()).toContain('coach-month-overview-dialog')
    expect(wrapper.findAll('[data-test="month-overview-date-group"]').map((group) => group.attributes('data-date')))
      .toEqual(['2026-10-01', '2026-10-03', '2026-10-31'])
    const rows = wrapper.findAll('[data-test="month-overview-event"]')
    expect(rows[0]!.text()).toContain('09:00 - 12:00')
    expect(rows[0]!.text()).toContain('場地：中港國小')
    expect(rows[0]!.text()).toContain('已指派教練：阿甲')
    expect(rows[0]!.classes()).toEqual(expect.arrayContaining(['border-l-blue-400', 'bg-blue-50/40']))
    expect(rows[0]!.get('[data-test="month-overview-source"]').classes()).toEqual(expect.arrayContaining(['bg-blue-50', 'text-blue-700', 'ring-blue-100']))
    expect(rows[0]!.get('[data-test="month-overview-source"]').text()).toBe('場地訓練')
    expect(rows[1]!.text()).toContain('時間未定')
    expect(rows[1]!.text()).toContain('未指派教練')
    expect(rows[2]!.text()).toContain('比賽')
    expect(rows[2]!.text()).toContain('已取消')
    expect(rows[2]!.classes()).toEqual(expect.arrayContaining(['border-l-amber-400', 'bg-amber-50/40']))
    expect(rows[2]!.get('[data-test="month-overview-source"]').classes()).toEqual(expect.arrayContaining(['bg-amber-50', 'text-amber-700', 'ring-amber-100']))
    expect(rows[2]!.get('[data-test="month-overview-source"]').text()).toBe('比賽')
    expect(wrapper.find('[data-test="refresh-month-overview"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('重新整理')
    expect(wrapper.text()).not.toContain('不應顯示的草稿')
    expect(wrapper.text()).toContain('3 個日期・3 筆活動')
    wrapper.unmount()
  })

  it('explains unsaved card drafts without replacing the persisted assignment data', () => {
    const wrapper = create({ hasUnsavedChanges: true })
    expect(wrapper.get('[data-test="month-overview-dirty"]').text()).toContain('最新已儲存資料')
    expect(wrapper.text()).toContain('阿甲')
    expect(wrapper.text()).not.toContain('不應顯示的草稿')
    wrapper.unmount()
  })

  it('shows loading/error states instead of stale rows and emits an explicit retry', async () => {
    const wrapper = create({ loading: true })
    expect(wrapper.findComponent(AppLoadingState).exists()).toBe(true)
    expect(wrapper.find('[data-test="month-overview-event"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="refresh-month-overview"]').exists()).toBe(false)
    await wrapper.setProps({ loading: false, error: '讀取失敗' })
    expect(wrapper.get('[data-test="month-overview-error"]').text()).toContain('讀取失敗')
    expect(wrapper.get('[data-test="month-overview-error"] [data-test="refresh-month-overview"]').text()).toBe('重試')
    expect(wrapper.get('[data-test="refresh-month-overview"]').classes()).toContain('!min-h-11')
    expect(wrapper.find('[data-test="month-overview-event"]').exists()).toBe(false)
    wrapper.findComponent<ComponentPublicInstance>('[data-test="refresh-month-overview"]').vm.$emit('click')
    expect(wrapper.emitted('refresh')).toEqual([[]])
    await wrapper.setProps({ error: '' })
    expect(wrapper.find('[data-test="refresh-month-overview"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows a clear empty month and provides a single footer close action', () => {
    const wrapper = create({ events: [] })
    expect(wrapper.get('[data-test="month-overview-empty"]').text()).toContain('沒有可排班活動')
    expect(wrapper.findComponent(AppDialogFooter).props('showCancel')).toBe(false)
    expect(wrapper.findComponent(AppDialogFooter).findAll('el-button-stub')).toHaveLength(1)
    wrapper.findComponent(AppDialogFooter).vm.$emit('confirm')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })
})
