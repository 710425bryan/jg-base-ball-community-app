import type {
  SchoolTeamMonthlyCalculationMode,
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
export const DEFAULT_SCHOOL_TEAM_SINGLE_MONTHLY_FEE = 2000
export const SCHOOL_TEAM_SINGLE_MONTHLY_MODE: SchoolTeamMonthlyCalculationMode = 'single_monthly'
export const SCHOOL_TEAM_TRAINING_DATES_MODE: SchoolTeamMonthlyCalculationMode = 'training_dates'

export const SCHOOL_TEAM_MONTHLY_FEE_PROGRAM_KEYS: SchoolTeamMonthlyFeeProgramKey[] = [
  CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
  JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY
]

const normalizeFeeAmount = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.trunc(parsed))
}

const getDefaultCalculationMode = (
  programKey: SchoolTeamMonthlyFeeProgramKey
): SchoolTeamMonthlyCalculationMode => programKey === JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY
  ? SCHOOL_TEAM_SINGLE_MONTHLY_MODE
  : SCHOOL_TEAM_TRAINING_DATES_MODE

export const normalizeSchoolTeamMonthlyPerSessionDefaults = (
  value?: Partial<SchoolTeamMonthlyPerSessionDefaults> | null,
  programKey: SchoolTeamMonthlyFeeProgramKey = CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY
): SchoolTeamMonthlyPerSessionDefaults => ({
  calculationMode: programKey === JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY
    && value?.calculationMode === SCHOOL_TEAM_TRAINING_DATES_MODE
      ? SCHOOL_TEAM_TRAINING_DATES_MODE
      : getDefaultCalculationMode(programKey),
  singleMonthlyFee: normalizeFeeAmount(
    value?.singleMonthlyFee,
    DEFAULT_SCHOOL_TEAM_SINGLE_MONTHLY_FEE
  ),
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
  [CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY]: normalizeSchoolTeamMonthlyPerSessionDefaults(
    null,
    CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY
  ),
  [JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY]: normalizeSchoolTeamMonthlyPerSessionDefaults(
    null,
    JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY
  )
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

export const getSchoolTeamSingleMonthlyFee = (
  isDiscounted: boolean,
  defaults?: Partial<SchoolTeamMonthlyPerSessionDefaults> | null
) => {
  const singleMonthlyFee = normalizeFeeAmount(
    defaults?.singleMonthlyFee,
    DEFAULT_SCHOOL_TEAM_SINGLE_MONTHLY_FEE
  )

  return isDiscounted ? Math.round(singleMonthlyFee / 2) : singleMonthlyFee
}

export const isSchoolTeamSingleMonthlyMode = (
  defaults?: Partial<SchoolTeamMonthlyPerSessionDefaults> | null
) => defaults?.calculationMode === SCHOOL_TEAM_SINGLE_MONTHLY_MODE
