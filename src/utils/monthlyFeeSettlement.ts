import dayjs, { type Dayjs } from 'dayjs'

export const MONTHLY_FEE_SETTLEMENT_SWITCH_DAY = 25

export const getDefaultMonthlyFeeSettlementMonth = (baseDate: Dayjs = dayjs()) => {
  const date = dayjs(baseDate)

  return date.date() >= MONTHLY_FEE_SETTLEMENT_SWITCH_DAY
    ? date.format('YYYY-MM')
    : date.subtract(1, 'month').format('YYYY-MM')
}
