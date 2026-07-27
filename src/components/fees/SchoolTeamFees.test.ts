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
    expect(source).toContain('中港校隊與新泰校隊分開試算')
  })

  it('keeps Xintai leave days visible without deducting the monthly amount', () => {
    expect(source).toContain('const leaveSessionsToDeduct = isXintaiPerSessionFee(fee) ? 0')
    expect(source).toContain('!isXintaiPerSessionFee(fee)')
    expect(source).toContain('請假僅記錄，不扣款')
    expect(source).toContain('新泰請假天數只記錄、不扣月費')
  })

  it('keeps community fixed monthly rows outside session and leave calculations', () => {
    expect(source).toContain('if (!isFixedMonthlyFee(fee))')
    expect(source).toContain('const countedLeaveDates = isFixedMonthly')
    expect(source).toContain('社區固定月繳不參與堂數與請假計算')
  })
})
