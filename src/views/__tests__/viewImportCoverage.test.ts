// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

const viewImports = [
  { name: 'AnnouncementsView', load: () => import('../AnnouncementsView.vue') },
  { name: 'AttendanceListView', load: () => import('../AttendanceListView.vue') },
  { name: 'BaseballAbilityDetailView', load: () => import('../BaseballAbilityDetailView.vue') },
  { name: 'BaseballAbilityView', load: () => import('../BaseballAbilityView.vue') },
  { name: 'CalendarView', load: () => import('../CalendarView.vue') },
  { name: 'CoachSchedulesView', load: () => import('../CoachSchedulesView.vue') },
  { name: 'EquipmentAddonsView', load: () => import('../EquipmentAddonsView.vue') },
  { name: 'EquipmentView', load: () => import('../EquipmentView.vue') },
  { name: 'FeesView', load: () => import('../FeesView.vue') },
  { name: 'JoinInquiriesView', load: () => import('../JoinInquiriesView.vue') },
  { name: 'LandingView', load: () => import('../LandingView.vue') },
  { name: 'LeaveRequestsView', load: () => import('../LeaveRequestsView.vue') },
  { name: 'MatchRecordsView', load: () => import('../MatchRecordsView.vue') },
  { name: 'MyLeaveRequestsView', load: () => import('../MyLeaveRequestsView.vue') },
  { name: 'MyPaymentsView', load: () => import('../MyPaymentsView.vue') },
  { name: 'PhysicalTestsDetailView', load: () => import('../PhysicalTestsDetailView.vue') },
  { name: 'PhysicalTestsView', load: () => import('../PhysicalTestsView.vue') },
  { name: 'PlayersView', load: () => import('../PlayersView.vue') },
  { name: 'ProfileSettingsView', load: () => import('../ProfileSettingsView.vue') },
  { name: 'PushEntryView', load: () => import('../PushEntryView.vue') },
  { name: 'RollCallView', load: () => import('../RollCallView.vue') },
  { name: 'TrainingDatesView', load: () => import('../TrainingDatesView.vue') },
  { name: 'TrainingLocationsView', load: () => import('../TrainingLocationsView.vue') },
  { name: 'TrainingProgramSettingsView', load: () => import('../TrainingProgramSettingsView.vue') },
  { name: 'TrainingView', load: () => import('../TrainingView.vue') },
  { name: 'UsersView', load: () => import('../UsersView.vue') },
  { name: 'VendorsView', load: () => import('../VendorsView.vue') }
]

describe('view import coverage', () => {
  it.each(viewImports)('loads $name without a broken dependency', async ({ load }) => {
    const module = await load()

    expect(module.default).toBeTruthy()
  })
})
