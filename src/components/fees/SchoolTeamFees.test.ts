import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./SchoolTeamFees.vue', import.meta.url), 'utf8')

describe('SchoolTeamFees joined-month scope', () => {
  it('loads joined_date and excludes monthly periods before the member joined', () => {
    expect(source).toContain("training_program, joined_date, status")
    expect(source).toContain("isMemberFeePeriodOnOrAfterJoin(m, 'monthly', selectedMonth.value)")
  })
})

describe('SchoolTeamFees school-team per-session fees', () => {
  it('uses independent Chunggang and Xintai defaults with each program date set', () => {
    expect(source).toContain("import { getSchoolTeamMonthlyPerSessionDefaults } from '@/services/schoolTeamMonthlyFeeSettings'")
    expect(source).toContain('isXintaiPerSessionFee')
    expect(source).toContain("getSchoolTeamMonthlyPerSessionDefaults('chunggang_school_team')")
    expect(source).toContain("getSchoolTeamMonthlyPerSessionDefaults('junior_high_school_team')")
    expect(source).toContain('getSchoolTeamMonthlyPerSessionFee')
    expect(source).toContain('getTrainingProgramForMember(member, programSettings.value)')
    expect(source).toContain('const programDates = nextTrainingMonthDatesByProgram[programKey] || []')
    expect(source).toContain('中港校隊固定依訓練日期計次')
  })

  it('uses the junior-high switch to choose a single monthly snapshot or training-date rates', () => {
    expect(source).toContain('isSchoolTeamSingleMonthlyMode')
    expect(source).toContain('getSchoolTeamSingleMonthlyFee')
    expect(source).toContain("? 'monthly_fixed'")
    expect(source).toContain('國中部單次月費')
    expect(source).toContain('單次月費不依堂數扣款')
    expect(source).toContain('isCommunityFixedMonthlyFee')
    expect(source).toContain('defineExpose({ refresh: fetchData })')
  })

  it('keeps Xintai leave days visible without deducting the monthly amount', () => {
    expect(source).toContain('const leaveSessionsToDeduct = isXintaiPerSessionFee(fee) ? 0')
    expect(source).toContain('!isXintaiPerSessionFee(fee)')
    expect(source).toContain('請假僅記錄，不扣款')
    expect(source).toContain('國中部請假天數只記錄、不扣月費')
    expect(source).toContain('國中部計次月費')
    expect(source).not.toContain('新泰校隊')
  })

  it('keeps community fixed monthly rows outside session and leave calculations', () => {
    expect(source).toContain('if (!isCommunityFixedMonthlyFee(fee))')
    expect(source).toContain('const countedLeaveDates = isCommunityFixedMonthly')
    expect(source).toContain('社區固定月繳不參與堂數與請假計算')
  })
})

describe('SchoolTeamFees monthly program tabs', () => {
  it('switches between Chunggang headquarters and junior high without an all-program option', () => {
    expect(source).toContain("import MonthlyFeeProgramTabs from '@/components/fees/MonthlyFeeProgramTabs.vue'")
    expect(source).toContain('<MonthlyFeeProgramTabs')
    expect(source).toContain('v-model="programFilter"')
    expect(source).toContain('const monthlyFeeProgramTabs = computed')
    expect(source).toContain('CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY')
    expect(source).toContain('JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY')
    expect(source).toContain("const programFilter = ref<SchoolTeamMonthlyFeeProgramKey>(CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY)")
    expect(source).toContain('if (fee.training_program !== programFilter.value) return false')
    expect(source).not.toContain('全部訓練項目')
    expect(source).not.toContain('AppMobileFilterSheet')
  })

  it('keeps the current tab in summary, CSV, empty state, and highlighted-member navigation', () => {
    expect(source).toContain('摘要依目前選定分頁即時統計')
    expect(source).toContain('const monthlyFeeEmptyStateText = computed')
    expect(source).toContain('月費結算表_${activeProgramLabel.value}_${selectedMonth.value}.csv')
    expect(source).toContain('programFilter.value = highlightedFee.training_program')
    expect(source).toContain(':disabled="isLoading || feesList.length === 0 || !hasChanges"')
  })
})
