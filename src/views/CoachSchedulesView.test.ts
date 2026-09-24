// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { normalizeCoachScheduleMonthPayload } from '@/utils/coachSchedules'
import CoachSchedulesView from './CoachSchedulesView.vue'

const mocks = vi.hoisted(() => ({ listAdminMonth: vi.fn(), listSchedulableCoaches: vi.fn(), saveEvent: vi.fn() }))
vi.mock('@/services/coachSchedulesApi', () => ({ coachSchedulesApi: mocks }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: () => true }) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { month: '2026-09' } }),
  useRouter: () => ({ replace: vi.fn() })
}))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: {} }))

describe('CoachSchedulesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listSchedulableCoaches.mockResolvedValue([])
    mocks.saveEvent.mockResolvedValue('a')
    mocks.listAdminMonth.mockResolvedValue(normalizeCoachScheduleMonthPayload({ events: [
      { id: 'a', source_type: 'training_location', source_id: 'junior', source_venue_id: 'va',
        program_label: '國中部', schedule_date: '2026-09-25', title: '訓練課程', coach_profile_ids: ['coach-a'] },
      { source_type: 'training_location', source_id: 'primary', source_venue_id: 'vb',
        program_label: '中港總部', schedule_date: '2026-09-25', title: '訓練課程' }
    ] }))
  })

  it('renders separate cards without program labels and saves only the selected source and coaches', async () => {
    const wrapper = shallowMount(CoachSchedulesView, { global: { stubs: {
      CoachScheduleEventSummary: false, 'el-icon': true, 'el-option': true, 'el-time-picker': true, 'el-form': true, 'el-dialog': true, 'el-select': true, 'el-input': true,
      'el-form-item': { template: '<div><slot /></div>' }, 'el-date-picker': true
    } } })
    await flushPromises()
    const cards = wrapper.findAll('[data-test="coach-schedule-event"]')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).not.toContain('國中部')
    expect(cards[1].text()).not.toContain('中港總部')
    await cards[0].findAll('button').find(button => button.text().includes('更新排班'))!.trigger('click')
    await flushPromises()
    expect(mocks.saveEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'a', source_id: 'junior', source_venue_id: 'va', coach_profile_ids: ['coach-a']
    }))
    expect(mocks.saveEvent).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renders one shared lesson and edits its full coach list with a revision check', async () => {
    mocks.listAdminMonth.mockResolvedValue(normalizeCoachScheduleMonthPayload({ events: [
      { id: 'shared', source_type: 'training_location', source_id: 'primary', source_venue_id: 'vb',
        program_label: '合班｜中港總部、國中部', schedule_date: '2026-09-25', title: '訓練課程',
        location: '中港國小', start_time: '09:00', end_time: '12:30',
        updated_at: '2026-09-24T06:00:00.123456+00:00', coach_profile_ids: ['coach-a', 'coach-b', 'coach-c'] }
    ] }))
    const wrapper = shallowMount(CoachSchedulesView, { global: { stubs: {
      CoachScheduleEventSummary: false, 'el-icon': true, 'el-option': true, 'el-time-picker': true,
      'el-form': true, 'el-dialog': true, 'el-select': true, 'el-input': true,
      'el-form-item': { template: '<div><slot /></div>' }, 'el-date-picker': true
    } } })
    await flushPromises()
    const cards = wrapper.findAll('[data-test="coach-schedule-event"]')
    expect(cards).toHaveLength(1)
    expect(cards[0].text()).not.toContain('國中部')
    expect(cards[0].text()).not.toContain('中港總部')
    expect(cards[0].text()).toContain('09:00 - 12:30')
    await cards[0].findAll('button').find(button => button.text().includes('更新排班'))!.trigger('click')
    await flushPromises()
    expect(mocks.saveEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'shared', source_id: 'primary', source_venue_id: 'vb',
      updated_at: '2026-09-24T06:00:00.123456+00:00', coach_profile_ids: ['coach-a', 'coach-b', 'coach-c']
    }))
    wrapper.unmount()
  })
})
