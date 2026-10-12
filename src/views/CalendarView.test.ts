// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarView from './CalendarView.vue'

const mocks = vi.hoisted(() => ({
  store: {} as any,
  route: { query: {} as Record<string, string> },
  replace: vi.fn(),
  warning: vi.fn(),
  can: vi.fn()
}))

vi.mock('@/stores/matches', () => ({ useMatchesStore: () => mocks.store }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => ({ can: mocks.can }) }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('element-plus', () => ({ ElMessage: { warning: mocks.warning } }))

const buildMatch = (id: string, cancelled = false) => ({
  id,
  match_name: `${id} 賽事`,
  opponent: `${id} 對手`,
  match_date: '2026-10-18',
  match_time: '09:00 - 11:00',
  location: '中港國小棒球場',
  cancelled_at: cancelled ? '2026-10-12T01:00:00Z' : null,
  cancellation_reason: cancelled ? '場地因雨關閉' : null
})

const mountCalendar = () => mount(CalendarView, {
  global: {
    stubs: {
      AppPageHeader: true,
      ElDialog: true,
      ElIcon: { template: '<span><slot /></span>' },
      MatchDetailDialog: {
        props: ['modelValue', 'matchId', 'readonly', 'canRestore'],
        template: '<div data-test="match-detail" :data-open="modelValue" :data-match-id="matchId" :data-can-restore="canRestore" />'
      }
    }
  }
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-12T08:00:00+08:00'))
  vi.clearAllMocks()
  mocks.can.mockReturnValue(false)
  mocks.route.query = {}
  mocks.store = reactive({
    matches: [buildMatch('cancelled', true), buildMatch('active')],
    loading: false,
    fetchUpcomingMatches: vi.fn().mockResolvedValue(undefined),
    fetchMatch: vi.fn()
  })
})

afterEach(() => vi.useRealTimers())

describe('CalendarView cancellation', () => {
  it.each([true, false])('allows recovery only with the edit capability (%s)', async allowed => {
    mocks.can.mockImplementation((feature, action) => allowed && feature === 'matches' && action === 'EDIT')
    const wrapper = mountCalendar()
    await flushPromises()
    expect(wrapper.get('[data-test="match-detail"]').attributes('data-can-restore')).toBe(String(allowed))
  })
  it('keeps cancelled details visible but excludes them from the next match', async () => {
    const wrapper = mountCalendar()
    await flushPromises()

    expect(wrapper.find('h3').text()).toContain('active 對手')
    const cancelledSection = wrapper.get('section[aria-label="已取消賽事"]')
    expect(cancelledSection.text()).toContain('已取消 · 無須集合')
    expect(cancelledSection.text()).toContain('場地因雨關閉')
    expect(cancelledSection.text()).toContain('09:00 - 11:00')
    expect(cancelledSection.text()).toContain('中港國小棒球場')
    await cancelledSection.get('button').trigger('click')
    expect(wrapper.get('[data-test="match-detail"]').attributes('data-match-id')).toBe('cancelled')
    expect(wrapper.get('[data-test="match-detail"]').attributes('data-open')).toBe('true')
  })

  it('opens a cancelled game from a notification deep link', async () => {
    mocks.route.query = { match_id: 'cancelled' }
    const wrapper = mountCalendar()
    await flushPromises()

    expect(wrapper.get('[data-test="match-detail"]').attributes('data-match-id')).toBe('cancelled')
    expect(wrapper.get('[data-test="match-detail"]').attributes('data-open')).toBe('true')
    expect(mocks.warning).not.toHaveBeenCalled()
  })
})
