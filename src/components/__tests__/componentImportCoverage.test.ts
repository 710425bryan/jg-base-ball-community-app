// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

const componentImports = [
  { name: 'PushSettingsDialog', load: () => import('../PushSettingsDialog.vue') },
  { name: 'RolePermissionsManager', load: () => import('../RolePermissionsManager.vue') },
  { name: 'PreviewableImage', load: () => import('../common/PreviewableImage.vue') },
  { name: 'EquipmentFormDialog', load: () => import('../equipment/EquipmentFormDialog.vue') },
  { name: 'EquipmentHistoryDialog', load: () => import('../equipment/EquipmentHistoryDialog.vue') },
  { name: 'EquipmentInventoryAdjustmentDialog', load: () => import('../equipment/EquipmentInventoryAdjustmentDialog.vue') },
  { name: 'EquipmentPurchaseMasterList', load: () => import('../equipment/EquipmentPurchaseMasterList.vue') },
  { name: 'EquipmentPaymentAdminDetail', load: () => import('../equipment/EquipmentPaymentAdminDetail.vue') },
  { name: 'EquipmentPhotoCarousel', load: () => import('../equipment/EquipmentPhotoCarousel.vue') },
  { name: 'EquipmentRequestActionDialog', load: () => import('../equipment/EquipmentRequestActionDialog.vue') },
  { name: 'EquipmentRequestAdminDetail', load: () => import('../equipment/EquipmentRequestAdminDetail.vue') },
  { name: 'EquipmentTransactionDialog', load: () => import('../equipment/EquipmentTransactionDialog.vue') },
  { name: 'MyEquipmentPaymentsPanel', load: () => import('../equipment/MyEquipmentPaymentsPanel.vue') },
  { name: 'FeeManagementReminderPanel', load: () => import('../fees/FeeManagementReminderPanel.vue') },
  { name: 'FeePaymentReminderDialog', load: () => import('../fees/FeePaymentReminderDialog.vue') },
  { name: 'FeeSettings', load: () => import('../fees/FeeSettings.vue') },
  { name: 'MatchFeeManagementPanel', load: () => import('../fees/MatchFeeManagementPanel.vue') },
  { name: 'MatchPaymentSubmissionInbox', load: () => import('../fees/MatchPaymentSubmissionInbox.vue') },
  { name: 'MyMatchFeesPanel', load: () => import('../fees/MyMatchFeesPanel.vue') },
  { name: 'PlayerBalanceManager', load: () => import('../fees/PlayerBalanceManager.vue') },
  { name: 'ProfilePaymentSubmissionInbox', load: () => import('../fees/ProfilePaymentSubmissionInbox.vue') },
  { name: 'QuarterlyFeeCompensationPanel', load: () => import('../fees/QuarterlyFeeCompensationPanel.vue') },
  { name: 'QuarterlyFees', load: () => import('../fees/QuarterlyFees.vue') },
  { name: 'SchoolTeamFees', load: () => import('../fees/SchoolTeamFees.vue') },
  { name: 'CoachScheduleDashboardPanel', load: () => import('../home/CoachScheduleDashboardPanel.vue') },
  { name: 'HomeHolidayHeroOverlay', load: () => import('../home/HomeHolidayHeroOverlay.vue') },
  { name: 'HolidayThemeSiteEffects', load: () => import('../layout/HolidayThemeSiteEffects.vue') },
  { name: 'MatchAttendanceStatsTab', load: () => import('../match-records/MatchAttendanceStatsTab.vue') },
  { name: 'MatchReminderScheduleDialog', load: () => import('../match-records/MatchReminderScheduleDialog.vue') },
  { name: 'SyncCalendarDialog', load: () => import('../match-records/SyncCalendarDialog.vue') },
  { name: 'VisualField', load: () => import('../match-records/VisualField.vue') },
  { name: 'PerformanceMemberDetailPage', load: () => import('../performance/PerformanceMemberDetailPage.vue') },
  { name: 'PerformanceRecordFormDialog', load: () => import('../performance/PerformanceRecordFormDialog.vue') },
  { name: 'PerformanceRecordsPage', load: () => import('../performance/PerformanceRecordsPage.vue') },
  { name: 'PerformanceTrendChart', load: () => import('../performance/PerformanceTrendChart.vue') },
  { name: 'TeamGroupSettingsDialog', load: () => import('../players/TeamGroupSettingsDialog.vue') },
  { name: 'HolidayThemePreviewStage', load: () => import('../settings/HolidayThemePreviewStage.vue') },
  { name: 'VendorFormDialog', load: () => import('../vendors/VendorFormDialog.vue') },
  { name: 'VendorPhotoGallery', load: () => import('../vendors/VendorPhotoGallery.vue') }
]

describe('component import coverage', () => {
  it.each(componentImports)('loads $name without a broken dependency', async ({ load }) => {
    const module = await load()

    expect(module.default).toBeTruthy()
  })
})
