// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import CoachScheduleEventSummary from './CoachScheduleEventSummary.vue'
import { normalizeCoachScheduleEvent } from '@/utils/coachSchedules'

describe('CoachScheduleEventSummary', () => {
  it('shows saved state, source fields and assigned coaches without a program badge', () => {
    const wrapper = shallowMount(CoachScheduleEventSummary, { global: { stubs: { 'el-icon': true, 'router-link': true } }, props: {
      event: normalizeCoachScheduleEvent({ id: 'saved', source_type: 'training_location',
        program_label: '國中部', title: '訓練課程', schedule_date: '2026-09-25',
        start_time: '09:00', end_time: '12:00', location: '中港國小' }),
      assignedCoachNames: ['甲教練', '乙教練']
    } })
    expect(wrapper.text()).not.toContain('國中部')
    for (const text of ['場地訓練', '已儲存', '訓練課程', '9/25', '09:00 - 12:00', '中港國小', '甲教練、乙教練']) {
      expect(wrapper.text()).toContain(text)
    }
  })

  it('does not invent a training program for manual or legacy payloads', () => {
    const wrapper = shallowMount(CoachScheduleEventSummary, { global: { stubs: { 'el-icon': true, 'router-link': true } }, props: {
      event: normalizeCoachScheduleEvent({ source_type: 'manual', title: '臨時排班' }),
      assignedCoachNames: []
    } })
    expect(wrapper.find('[data-test="coach-schedule-program"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('手動排班')
    expect(wrapper.text()).not.toContain('已指派教練')
  })
})
