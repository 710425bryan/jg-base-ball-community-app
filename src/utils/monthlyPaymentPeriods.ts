import dayjs, { type Dayjs } from 'dayjs'
import {
  getMonthlyFeeCalculationType,
  isXintaiPerSessionBillingMember,
  type BillingModeMember
} from './memberBilling'

export const MONTHLY_ADVANCE_PAYMENT_NEXT_PERIOD_SWITCH_DAY = 25

const MONTHLY_PERIOD_KEY_PATTERN = /^[0-9]{4}-[0-9]{2}$/

export const normalizeMonthlyPeriodKey = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

export const isMonthlyPeriodKey = (value: unknown) =>
  MONTHLY_PERIOD_KEY_PATTERN.test(normalizeMonthlyPeriodKey(value))

const getMonthlyPeriodStart = (periodKey: unknown) => {
  const normalizedPeriodKey = normalizeMonthlyPeriodKey(periodKey)
  if (!isMonthlyPeriodKey(normalizedPeriodKey)) return null

  const parsed = dayjs(`${normalizedPeriodKey}-01`)
  return parsed.isValid() ? parsed : null
}

export const getMonthlyPeriodIndex = (periodKey: unknown) => {
  const periodStart = getMonthlyPeriodStart(periodKey)
  if (!periodStart) return null

  return periodStart.year() * 12 + periodStart.month() + 1
}

export const isAdvanceMonthlyPaymentMember = (member: BillingModeMember) =>
  getMonthlyFeeCalculationType(member) === 'monthly_fixed'
  || isXintaiPerSessionBillingMember(member)

export const getMonthlyPaymentOpenPeriodKey = (
  member: BillingModeMember,
  baseDate: Dayjs = dayjs()
) => {
  const date = dayjs(baseDate)

  if (isAdvanceMonthlyPaymentMember(member)) {
    return (date.date() >= MONTHLY_ADVANCE_PAYMENT_NEXT_PERIOD_SWITCH_DAY
      ? date.add(1, 'month')
      : date
    ).format('YYYY-MM')
  }

  return date.subtract(1, 'month').format('YYYY-MM')
}

export const isMonthlyPaymentPeriodOpen = (
  member: BillingModeMember,
  periodKey: unknown,
  baseDate: Dayjs = dayjs()
) => {
  const periodIndex = getMonthlyPeriodIndex(periodKey)
  const openPeriodIndex = getMonthlyPeriodIndex(getMonthlyPaymentOpenPeriodKey(member, baseDate))

  return periodIndex !== null && openPeriodIndex !== null && periodIndex <= openPeriodIndex
}

export const getNextMonthlyPaymentPeriodInfo = (
  member: BillingModeMember,
  baseDate: Dayjs = dayjs()
) => {
  const currentPeriodStart = getMonthlyPeriodStart(getMonthlyPaymentOpenPeriodKey(member, baseDate))
    || dayjs(baseDate).startOf('month')
  const nextPeriodStart = currentPeriodStart.add(1, 'month')
  const openDate = isAdvanceMonthlyPaymentMember(member)
    ? nextPeriodStart.subtract(1, 'month').date(MONTHLY_ADVANCE_PAYMENT_NEXT_PERIOD_SWITCH_DAY)
    : nextPeriodStart.add(1, 'month').startOf('month')

  return {
    periodKey: nextPeriodStart.format('YYYY-MM'),
    openDate: openDate.format('YYYY-MM-DD')
  }
}
