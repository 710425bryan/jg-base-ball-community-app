import type {
  SchoolTeamMonthlyFeeProgramKey,
  SchoolTeamMonthlyPerSessionDefaults,
  SchoolTeamMonthlyPerSessionDefaultsByProgram
} from '@/types/schoolTeamMonthlyFee'
import {
  CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
  JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY
} from '@/utils/trainingPrograms'

export const DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE = 500
export const DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE = 250

export const SCHOOL_TEAM_MONTHLY_FEE_PROGRAM_KEYS: SchoolTeamMonthlyFeeProgramKey[] = [
  CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
  JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY
]

const normalizeFeeAmount = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.trunc(parsed))
}

export const normalizeSchoolTeamMonthlyPerSessionDefaults = (
  value?: Partial<SchoolTeamMonthlyPerSessionDefaults> | null
): SchoolTeamMonthlyPerSessionDefaults => ({
  regularPerSessionFee: normalizeFeeAmount(
    value?.regularPerSessionFee,
    DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE
  ),
  discountPerSessionFee: normalizeFeeAmount(
    value?.discountPerSessionFee,
    DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE
  )
})

export const createDefaultSchoolTeamMonthlyPerSessionDefaultsByProgram = (
): SchoolTeamMonthlyPerSessionDefaultsByProgram => ({
  [CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY]: normalizeSchoolTeamMonthlyPerSessionDefaults(),
  [JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY]: normalizeSchoolTeamMonthlyPerSessionDefaults()
})

export const getSchoolTeamMonthlyPerSessionFee = (
  isDiscounted: boolean,
  defaults?: Partial<SchoolTeamMonthlyPerSessionDefaults> | null
) => {
  const normalizedDefaults = normalizeSchoolTeamMonthlyPerSessionDefaults(defaults)
  return isDiscounted
    ? normalizedDefaults.discountPerSessionFee
    : normalizedDefaults.regularPerSessionFee
}
