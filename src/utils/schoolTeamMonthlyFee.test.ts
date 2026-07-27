import { describe, expect, it } from 'vitest'
import {
  createDefaultSchoolTeamMonthlyPerSessionDefaultsByProgram,
  DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE,
  DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
  getSchoolTeamMonthlyPerSessionFee,
  normalizeSchoolTeamMonthlyPerSessionDefaults
} from './schoolTeamMonthlyFee'

describe('schoolTeamMonthlyFee', () => {
  it('uses independent 500 and 250 defaults for Chunggang and Xintai', () => {
    expect(createDefaultSchoolTeamMonthlyPerSessionDefaultsByProgram()).toEqual({
      chunggang_school_team: {
        regularPerSessionFee: DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
        discountPerSessionFee: DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE
      },
      junior_high_school_team: {
        regularPerSessionFee: DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
        discountPerSessionFee: DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE
      }
    })
    expect(getSchoolTeamMonthlyPerSessionFee(false)).toBe(500)
    expect(getSchoolTeamMonthlyPerSessionFee(true)).toBe(250)
  })

  it('normalizes custom settings and rejects negative fees', () => {
    expect(normalizeSchoolTeamMonthlyPerSessionDefaults({
      regularPerSessionFee: 600.9,
      discountPerSessionFee: -50
    })).toEqual({
      regularPerSessionFee: 600,
      discountPerSessionFee: 0
    })
  })
})
