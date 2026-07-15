// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils'
import dayjs from 'dayjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchRecordsView from './MatchRecordsView.vue'

const storeMocks = vi.hoisted(() => ({
  matches: {
    matches: [] as Array<Record<string, unknown>>,
    loading: false,
    fetchMatches: vi.fn(),
    deleteMatch: vi.fn()
  },
  permissions: {
    can: vi.fn()
  }
}))

const routerMocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, string> },
  replace: vi.fn()
}))

vi.mock('@/stores/matches', () => ({
  useMatchesStore: () => storeMocks.matches
}))

vi.mock('@/stores/permissions', () => ({
  usePermissionsStore: () => storeMocks.permissions
}))

vi.mock('vue-router', () => ({
  useRoute: () => routerMocks.route,
  useRouter: () => ({ replace: routerMocks.replace })
}))

vi.mock('@/components/common/AppPageHeader.vue', () => ({
  default: { template: '<header><slot /><slot name="actions" /></header>' }
}))

vi.mock('@/components/match-records/MatchesGrid.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('@/components/match-records/MatchesTable.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('@/components/match-records/MatchDetailDialog.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('@/components/match-records/MatchFormDialog.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('@/components/match-records/SyncCalendarDialog.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('@/components/match-records/MatchReminderScheduleDialog.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('@/components/match-records/MatchTournamentStatsTab.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('@/components/match-records/MatchAttendanceStatsTab.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('@/components/ViewModeSwitch.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('@/services/matchReminderNotifications', () => ({
  sendMatchReminderNotification: vi.fn()
}))

vi.mock('@/utils/pushNotifications', () => ({
  describePushDispatchIssue: vi.fn()
}))

describe('MatchRecordsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeMocks.matches.matches = [
      {
        id: 'future-match',
        match_name: '未來賽事',
        opponent: '測試球隊',
        match_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
        match_time: '09:00',
        location: '中港國小',
        category_group: 'U12',
        match_level: '友誼賽'
      },
      {
        id: 'past-match',
        match_name: '過去賽事',
        opponent: '測試球隊',
        match_date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
        match_time: '09:00',
        location: '中港國小',
        category_group: 'U12',
        match_level: '友誼賽'
      }
    ]
    storeMocks.matches.loading = false
    storeMocks.matches.fetchMatches.mockResolvedValue(undefined)
    storeMocks.permissions.can.mockReturnValue(false)
  })

  it('puts future matches first and selects them by default', () => {
    const wrapper = shallowMount(MatchRecordsView, {
      global: {
        directives: {
          loading: () => undefined
        },
        stubs: {
          'el-button': true,
          'el-date-picker': true,
          'el-icon': true,
          'el-input': true,
          'el-option': true,
          'el-popover': true,
          'el-select': true
        }
      }
    })

    const tabs = wrapper.findAll('button')

    expect(tabs.map((tab) => tab.text())).toEqual([
      '未來賽事',
      '賽事紀錄',
      '賽事成績',
      '賽事出席率'
    ])
    expect((wrapper.vm as any).activeMainTab).toBe('future')
    expect((wrapper.vm as any).filteredMatches.map((match: { id: string }) => match.id)).toEqual(['future-match'])
  })
})
