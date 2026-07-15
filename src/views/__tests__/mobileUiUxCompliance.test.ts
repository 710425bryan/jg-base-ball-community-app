import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readView = (name: string) => readFileSync(new URL(`../${name}.vue`, import.meta.url), 'utf8')
const readComponent = (path: string) => readFileSync(new URL(`../../components/${path}.vue`, import.meta.url), 'utf8')

const auditedViews = [
  'HomeView',
  'CalendarView',
  'ProfileSettingsView',
  'MyPaymentsView',
  'MyPlayerRecordsView',
  'EquipmentAddonsView',
  'MyLeaveRequestsView',
  'TrainingView',
  'TrainingLocationsView',
  'TrainingDatesView',
  'TrainingProgramSettingsView',
  'CoachSchedulesView',
  'PlayersView',
  'UsersView',
  'LeaveRequestsView',
  'AttendanceListView',
  'JoinInquiriesView',
  'AnnouncementsView',
  'EquipmentView',
  'VendorsView',
  'FeesView',
  'MatchRecordsView',
  'RollCallView',
  'HolidayThemeSettingsView'
]

describe('mobile UI/UX audit contracts', () => {
  it.each(auditedViews)('%s leaves bottom navigation spacing to MainLayout', (name) => {
    const source = readView(name)

    expect(source).not.toContain('pb-[calc(4.5rem')
    expect(source).not.toMatch(/\bpb-24\b/)
  })

  it.each(auditedViews)('%s does not clip MainLayout vertical scrolling at the route root', (name) => {
    const source = readView(name)
    const templateSource = source.slice(source.indexOf('<template>'))
    const rootClass = templateSource.match(/<div class="([^"]+)"/)?.[1] || ''

    expect(rootClass.split(/\s+/)).not.toContain('h-full')
    expect(rootClass.split(/\s+/)).not.toContain('overflow-hidden')
  })

  it('uses shared overflow and dialog footer controls on multi-action surfaces', () => {
    expect(readView('MatchRecordsView')).toContain('AppActionOverflow')
    expect(readView('PlayersView')).toContain('AppActionOverflow')
    expect(readView('AnnouncementsView')).toContain('AppActionOverflow')
    expect(readView('EquipmentView')).toContain('AppActionOverflow')
    expect(readView('VendorsView')).toContain('AppActionOverflow')
    expect(readView('MyPaymentsView')).toContain('AppDialogFooter')
    expect(readView('MyLeaveRequestsView')).toContain('AppDialogFooter')
    expect(readView('AttendanceListView')).toContain('AppDialogFooter')
    expect(readView('LeaveRequestsView')).toContain('AppDialogFooter')
    expect(readView('UsersView')).toContain('AppDialogFooter')
    expect(readView('CoachSchedulesView')).toContain('AppDialogFooter')
  })

  it('uses the shared non-white segmented control for every grid and table switch', () => {
    const announcements = readView('AnnouncementsView')
    const sharedSwitch = readComponent('ViewModeSwitch')

    expect(announcements).toContain(
      '<ViewModeSwitch v-model="viewMode" grid-label="卡片" table-label="表格" />'
    )
    expect(announcements).not.toContain('bg-white text-primary shadow-sm')
    expect(sharedSwitch).toContain('bg-orange-50 text-primary')
    expect(sharedSwitch).not.toContain('bg-white text-primary')
  })

  it('keeps filters out of page-header actions on key management views', () => {
    const matchRecords = readView('MatchRecordsView')
    const users = readView('UsersView')

    expect(matchRecords).toContain('<AppPageHeader title="比賽紀錄" subtitle="Match Records" :icon="Trophy" />')
    expect(matchRecords).toContain('<div class="app-page-toolbar match-records-toolbar">')
    expect(users).toContain('class="app-page-toolbar"')
  })

  it('uses a full-width mobile search row and bottom filter sheet on filter-heavy pages', () => {
    const filterHeavyViews = [
      'MatchRecordsView',
      'PlayersView',
      'UsersView',
      'EquipmentView',
      'VendorsView'
    ]

    filterHeavyViews.forEach((name) => {
      const source = readView(name)
      expect(source).toContain('AppMobileFilterSheet')
      expect(source).toContain('app-search-filter-bar')
      expect(source).toContain('app-mobile-filter-trigger')
      expect(source).toContain(':aria-expanded="isMobileFiltersOpen"')
    })

    const schoolTeamFees = readComponent('fees/SchoolTeamFees')
    expect(schoolTeamFees).toContain('AppMobileFilterSheet')
    expect(schoolTeamFees).toContain('app-search-filter-bar')
    expect(schoolTeamFees).toContain('aria-label="開啟月費篩選"')
  })

  it('keeps shared performance route roots compatible with MainLayout scrolling', () => {
    const performanceComponents = [
      readComponent('performance/PerformanceRecordsPage'),
      readComponent('performance/PerformanceMemberDetailPage')
    ]

    performanceComponents.forEach((source) => {
      const templateSource = source.slice(source.indexOf('<template>'))
      const rootClass = templateSource.match(/<div class="([^"]+)"/)?.[1] || ''
      expect(rootClass.split(/\s+/)).not.toContain('h-full')
      expect(rootClass.split(/\s+/)).not.toContain('overflow-hidden')
    })

    expect(performanceComponents[0]).toContain(
      '<ViewModeSwitch v-model="viewMode" grid-label="卡片" table-label="表格" class="self-start shrink-0" />'
    )
  })

  it('keeps roll call actions accessible without exposing absence as a detail action', () => {
    const source = readView('RollCallView')

    expect(source).toContain('aria-label="返回點名列表"')
    expect(source).toContain(':aria-pressed="player.status === status.value"')
    expect(source).not.toContain("{ label: '缺席'")
  })

  it('separates selectable cards from their destructive controls', () => {
    const trainingLocations = readView('TrainingLocationsView')
    const holidayTheme = readView('HolidayThemeSettingsView')

    expect(trainingLocations).toContain(':aria-pressed="selectedSessionId === session.session_id"')
    expect(trainingLocations).toContain('class="app-icon-button')
    expect(holidayTheme).toContain(':aria-pressed="activity.id === selectedActivityId"')
    expect(holidayTheme).toContain('class="!h-11 !w-11 !rounded-xl !p-0"')
  })
})
