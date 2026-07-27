import { describe, expect, it } from 'vitest'
import {
  createDefaultSchoolTeamMonthlyPerSessionDefaultsByProgram,
  DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE,
  DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
  DEFAULT_SCHOOL_TEAM_SINGLE_MONTHLY_FEE,
  getSchoolTeamMonthlyPerSessionFee,
  getSchoolTeamSingleMonthlyFee,
  isSchoolTeamSingleMonthlyMode,
  normalizeSchoolTeamMonthlyPerSessionDefaults
} from './schoolTeamMonthlyFee'

describe('schoolTeamMonthlyFee', () => {
  it('uses independent 500 and 250 defaults for Chunggang and Xintai', () => {
    expect(createDefaultSchoolTeamMonthlyPerSessionDefaultsByProgram()).toEqual({
      chunggang_school_team: {
        calculationMode: 'training_dates',
        singleMonthlyFee: DEFAULT_SCHOOL_TEAM_SINGLE_MONTHLY_FEE,
        regularPerSessionFee: DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
        discountPerSessionFee: DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE
      },
      junior_high_school_team: {
        calculationMode: 'single_monthly',
        singleMonthlyFee: DEFAULT_SCHOOL_TEAM_SINGLE_MONTHLY_FEE,
        regularPerSessionFee: DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
        discountPerSessionFee: DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE
      }
    })
    expect(getSchoolTeamMonthlyPerSessionFee(false)).toBe(500)
    expect(getSchoolTeamMonthlyPerSessionFee(true)).toBe(250)
    expect(getSchoolTeamSingleMonthlyFee(false)).toBe(2000)
    expect(getSchoolTeamSingleMonthlyFee(true)).toBe(1000)
  })

  it('normalizes custom settings and rejects negative fees', () => {
    expect(normalizeSchoolTeamMonthlyPerSessionDefaults({
      calculationMode: 'training_dates',
      singleMonthlyFee: 2200.9,
      regularPerSessionFee: 600.9,
      discountPerSessionFee: -50
    }, 'junior_high_school_team')).toEqual({
      calculationMode: 'training_dates',
      singleMonthlyFee: 2200,
      regularPerSessionFee: 600,
      discountPerSessionFee: 0
    })
  })

  it('defaults junior high to a single monthly fee and can switch to training dates', () => {
    const singleMonthly = normalizeSchoolTeamMonthlyPerSessionDefaults(
      null,
      'junior_high_school_team'
    )
    const trainingDates = normalizeSchoolTeamMonthlyPerSessionDefaults({
      calculationMode: 'training_dates'
    }, 'junior_high_school_team')

    expect(isSchoolTeamSingleMonthlyMode(singleMonthly)).toBe(true)
    expect(isSchoolTeamSingleMonthlyMode(trainingDates)).toBe(false)
    expect(getSchoolTeamSingleMonthlyFee(true, { singleMonthlyFee: 2500 })).toBe(1250)
  })
})
