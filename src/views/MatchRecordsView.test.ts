// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils'
import dayjs from 'dayjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchRecordsView from './MatchRecordsView.vue'
import source from './MatchRecordsView.vue?raw'

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

  it('publishes the measured sticky toolbar height for month headings', () => {
    expect(source).toContain('ref="stickyToolbarRef"')
    expect(source).toContain("'--match-records-sticky-offset': `${stickyToolbarHeight.value}px`")
    expect(source).toContain('new ResizeObserver(updateStickyToolbarHeight)')
    const toolbarClasses = source.match(/ref="stickyToolbarRef" class="([^"]+)"/)?.[1].split(' ') || []
    expect(toolbarClasses).toContain('md:sticky')
    expect(toolbarClasses).not.toContain('sticky')
  })

  it('opens cancellation only for an editable active non-training match', async () => {
    const wrapper = shallowMount(MatchRecordsView, { global: { directives: { loading: () => undefined } } })
    const vm = wrapper.vm as any
    vm.handleCancelMatch('future-match')
    expect(vm.cancelDialogVisible).toBe(false)
    storeMocks.permissions.can.mockReturnValue(true)
    // Permission store is mocked without reactivity: remount to hydrate computed permissions.
    wrapper.unmount()
    const editable = shallowMount(MatchRecordsView, { global: { directives: { loading: () => undefined } } })
    const editableVm = editable.vm as any
    editableVm.handleCancelMatch('future-match')
    expect(editableVm.cancelDialogVisible).toBe(true)
    expect(editableVm.cancellationMatch.id).toBe('future-match')
    editableVm.cancelDialogVisible = false
    storeMocks.matches.matches[0]!.cancelled_at = '2026-10-12'
    editableVm.handleCancelMatch('future-match')
    expect(editableVm.cancelDialogVisible).toBe(false)
    editable.unmount()
  })
  it('opens recovery only for an editable cancelled match', () => {
    storeMocks.matches.matches[0]!.cancelled_at = '2026-10-12'
    const readonly = shallowMount(MatchRecordsView, { global: { directives: { loading: () => undefined } } })
    ;(readonly.vm as any).handleRestoreMatch('future-match')
    expect((readonly.vm as any).restoreDialogVisible).toBe(false)
    readonly.unmount()
    storeMocks.permissions.can.mockReturnValue(true)
    const wrapper = shallowMount(MatchRecordsView, { global: { directives: { loading: () => undefined } } })
    ;(wrapper.vm as any).handleRestoreMatch('future-match')
    expect((wrapper.vm as any).restoreDialogVisible).toBe(true)
    expect((wrapper.vm as any).restorationMatch.id).toBe('future-match')
    wrapper.unmount()
  })

  it('aligns desktop toolbar controls to the shared 44px height', () => {
    expect(source).toContain('class="app-page-toolbar match-records-toolbar"')
    expect(source).toContain('size="large"')
    expect(source).toContain('min-height: 44px;')
    expect(source).toContain('!h-11 !min-h-11')
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

    const tabs = wrapper.findAll('button[aria-pressed]')

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
