import {
  getDefaultTrainingMonthDates,
  getTrainingMonthStartDate,
  normalizeTrainingMonth,
  normalizeTrainingMonthDateList
} from './trainingMonthDates'

export const DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT = 500
export const DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT = 250

export type QuarterlyFeeCompensationDefaults = {
  regularDailyCredit: number
  discountDailyCredit: number
}

export type QuarterlyFeeCompensationMonthSummary = {
  month: string
  monthStart: string
  baselineSessionCount: number
  configuredSessionCount: number
  compensationDays: number
  baselineSaturdayDates: string[]
  configuredTrainingDates: string[]
}

const normalizeCreditAmount = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.trunc(parsed))
}

export const normalizeQuarterlyFeeCompensationDefaults = (
  value?: Partial<QuarterlyFeeCompensationDefaults> | null
): QuarterlyFeeCompensationDefaults => ({
  regularDailyCredit: normalizeCreditAmount(
    value?.regularDailyCredit,
    DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT
  ),
  discountDailyCredit: normalizeCreditAmount(
    value?.discountDailyCredit,
    DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT
  )
})

export const buildQuarterlyFeeCompensationMonthSummary = (input: {
  month: string
  trainingDates: Array<string | null | undefined>
}): QuarterlyFeeCompensationMonthSummary => {
  const month = normalizeTrainingMonth(input.month)
  const baselineSaturdayDates = getDefaultTrainingMonthDates(month)
  const configuredTrainingDates = normalizeTrainingMonthDateList(input.trainingDates, month)

  return {
    month,
    monthStart: getTrainingMonthStartDate(month),
    baselineSessionCount: baselineSaturdayDates.length,
    configuredSessionCount: configuredTrainingDates.length,
    compensationDays: Math.max(0, baselineSaturdayDates.length - configuredTrainingDates.length),
    baselineSaturdayDates,
    configuredTrainingDates
  }
}

export const getQuarterlyFeeCompensationDailyCredit = (
  isDiscounted: boolean,
  defaults?: Partial<QuarterlyFeeCompensationDefaults> | null
) => {
  const normalizedDefaults = normalizeQuarterlyFeeCompensationDefaults(defaults)
  return isDiscounted
    ? normalizedDefaults.discountDailyCredit
    : normalizedDefaults.regularDailyCredit
}

export const calculateQuarterlyFeeCompensationAmount = (input: {
  compensationDays: unknown
  isDiscounted: boolean
  defaults?: Partial<QuarterlyFeeCompensationDefaults> | null
}) => {
  const days = Math.max(0, Math.trunc(Number(input.compensationDays) || 0))
  return days * getQuarterlyFeeCompensationDailyCredit(input.isDiscounted, input.defaults)
}
