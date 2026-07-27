export type SchoolTeamMonthlyFeeProgramKey =
  | 'chunggang_school_team'
  | 'junior_high_school_team'

export type SchoolTeamMonthlyPerSessionDefaults = {
  regularPerSessionFee: number
  discountPerSessionFee: number
}

export type SchoolTeamMonthlyPerSessionDefaultsByProgram = Record<
  SchoolTeamMonthlyFeeProgramKey,
  SchoolTeamMonthlyPerSessionDefaults
>
