import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  getMonthlyPaymentOpenPeriodKey,
  getMonthlyPeriodIndex,
  getNextMonthlyPaymentPeriodInfo,
  isMonthlyPaymentPeriodOpen
} from './monthlyPaymentPeriods'

describe('monthlyPaymentPeriods', () => {
  const schoolTeamMember = { role: '校隊', fee_billing_mode: 'role_default' }
  const fixedMonthlyPlayer = { role: '球員', fee_billing_mode: 'monthly_fixed' }

  it('opens school team per-session payments only after the month ends', () => {
    expect(getMonthlyPaymentOpenPeriodKey(schoolTeamMember, dayjs('2026-07-01'))).toBe('2026-06')
    expect(getMonthlyPaymentOpenPeriodKey(schoolTeamMember, dayjs('2026-07-31'))).toBe('2026-06')
    expect(getMonthlyPaymentOpenPeriodKey(schoolTeamMember, dayjs('2026-08-01'))).toBe('2026-07')
  })

  it('opens the next fixed monthly player period from the 25th', () => {
    expect(getMonthlyPaymentOpenPeriodKey(fixedMonthlyPlayer, dayjs('2026-07-24'))).toBe('2026-07')
    expect(getMonthlyPaymentOpenPeriodKey(fixedMonthlyPlayer, dayjs('2026-07-25'))).toBe('2026-08')
    expect(getMonthlyPaymentOpenPeriodKey(fixedMonthlyPlayer, dayjs('2026-12-25'))).toBe('2027-01')
  })

  it('keeps past monthly periods payable but blocks unopened future months', () => {
    expect(getMonthlyPeriodIndex('2026-07')).toBe(24319)
    expect(isMonthlyPaymentPeriodOpen(schoolTeamMember, '2026-06', dayjs('2026-07-01'))).toBe(true)
    expect(isMonthlyPaymentPeriodOpen(schoolTeamMember, '2026-07', dayjs('2026-07-01'))).toBe(false)
    expect(isMonthlyPaymentPeriodOpen(fixedMonthlyPlayer, '2026-08', dayjs('2026-07-24'))).toBe(false)
    expect(isMonthlyPaymentPeriodOpen(fixedMonthlyPlayer, '2026-08', dayjs('2026-07-25'))).toBe(true)
  })

  it('reports the next period and open date for helper copy', () => {
    expect(getNextMonthlyPaymentPeriodInfo(schoolTeamMember, dayjs('2026-07-01'))).toEqual({
      periodKey: '2026-07',
      openDate: '2026-08-01'
    })
    expect(getNextMonthlyPaymentPeriodInfo(fixedMonthlyPlayer, dayjs('2026-07-01'))).toEqual({
      periodKey: '2026-08',
      openDate: '2026-07-25'
    })
  })
})
