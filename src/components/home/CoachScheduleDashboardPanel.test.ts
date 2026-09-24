// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import CoachScheduleDashboardPanel from './CoachScheduleDashboardPanel.vue'
import { normalizeCoachScheduleMonthPayload } from '@/utils/coachSchedules'

describe('CoachScheduleDashboardPanel', () => {
  it('shows the shared lesson once without program labels', () => {
    const wrapper = shallowMount(CoachScheduleDashboardPanel, { global: { stubs: { 'el-icon': true, 'router-link': true } }, props: {
      payload: normalizeCoachScheduleMonthPayload({ scope: 'all', month_start: '2026-09-01', events: [
        { id: 'shared', source_type: 'training_location', source_id: 'primary', source_venue_id: 'vb',
          program_label: '合班｜中港總部、國中部', schedule_date: '2026-09-25', title: '訓練課程',
          start_time: '09:00', end_time: '12:30', location: '中港國小' }
      ] })
    } })
    expect(wrapper.findAll('[data-test="coach-schedule-dashboard-item"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('國中部')
    expect(wrapper.text()).not.toContain('中港總部')
    expect(wrapper.text()).toContain('09:00 - 12:30')
    wrapper.unmount()
  })
  it('keeps separate saved schedules without displaying their training programs', () => {
    const wrapper = shallowMount(CoachScheduleDashboardPanel, { global: { stubs: { 'el-icon': true, 'router-link': true } }, props: {
      payload: normalizeCoachScheduleMonthPayload({ scope: 'all', month_start: '2026-09-01', events: [
        { id: 'a', source_type: 'training_location', source_id: 'junior', source_venue_id: 'va',
          program_label: '國中部', schedule_date: '2026-09-25', title: '訓練課程' },
        { id: 'b', source_type: 'training_location', source_id: 'primary', source_venue_id: 'vb',
          program_label: '中港總部', schedule_date: '2026-09-25', title: '訓練課程' },
        { id: 'c', source_type: 'manual', schedule_date: '2026-09-25', title: '手動' }
      ] })
    } })
    expect(wrapper.findAll('[data-test="coach-schedule-dashboard-item"]')).toHaveLength(3)
    expect(wrapper.text()).not.toContain('國中部')
    expect(wrapper.text()).not.toContain('中港總部')
  })
})
