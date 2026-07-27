export type SchoolTeamMonthlyFeeProgramKey =
  | 'chunggang_school_team'
  | 'junior_high_school_team'

export type SchoolTeamMonthlyCalculationMode = 'single_monthly' | 'training_dates'

export type SchoolTeamMonthlyPerSessionDefaults = {
  calculationMode: SchoolTeamMonthlyCalculationMode
  singleMonthlyFee: number
  regularPerSessionFee: number
  discountPerSessionFee: number
}

export type SchoolTeamMonthlyPerSessionDefaultsByProgram = Record<
  SchoolTeamMonthlyFeeProgramKey,
  SchoolTeamMonthlyPerSessionDefaults
>
