import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  canUseGroupedQuarterlyPaymentSubmission,
  getQuarterlyPaymentOpenPeriodKey,
  getQuarterlyPeriodIndex,
  isQuarterlyPeriodKey,
  isQuarterlyPaymentPeriodOpen,
  resolveQuarterlyDefaultPeriodKey,
  summarizeQuarterlyPaymentSubmissionItems,
  validateQuarterlyPaymentSubmissionItems
} from './quarterlyPaymentSubmissions'

describe('quarterlyPaymentSubmissions', () => {
  it('summarizes multi-player quarterly line items', () => {
    const summary = summarizeQuarterlyPaymentSubmissionItems([
      { member_id: 'member-a', period_key: '2026-q2', amount: 6000, balance_amount: 1000 },
      { member_id: 'member-b', period_key: '2026-Q2', amount: 3000, balance_amount: 500 }
    ])

    expect(summary.totalAmount).toBe(9000)
    expect(summary.totalBalanceAmount).toBe(1500)
    expect(summary.externalAmount).toBe(7500)
    expect(summary.items.map((item) => item.period_key)).toEqual(['2026-Q2', '2026-Q2'])
  })

  it('validates each member balance independently', () => {
    const errors = validateQuarterlyPaymentSubmissionItems([
      { member_id: 'member-a', period_key: '2026-Q2', amount: 6000, balance_amount: 1500 },
      { member_id: 'member-b', period_key: '2026-Q2', amount: 3000, balance_amount: 500 }
    ], {
      periodKey: '2026-Q2',
      availableBalances: {
        'member-a': 1000,
        'member-b': 500
      }
    })

    expect(errors).toEqual(['balance_amount cannot exceed member balance'])
  })

  it('rejects selected quarterly players without a positive amount', () => {
    const errors = validateQuarterlyPaymentSubmissionItems([
      { member_id: 'member-a', period_key: '2026-Q2', amount: 6000, balance_amount: 0 },
      { member_id: 'member-b', period_key: '2026-Q2', amount: 0, balance_amount: 0 }
    ], {
      periodKey: '2026-Q2',
      availableBalances: {
        'member-a': 1000,
        'member-b': 500
      }
    })

    expect(errors).toContain('all quarterly payment item amounts must be greater than 0')
  })

  it('recognizes only quarterly period keys', () => {
    expect(isQuarterlyPeriodKey('2026-q2')).toBe(true)
    expect(isQuarterlyPeriodKey('2026-04')).toBe(false)
  })

  it('falls back to the current quarter when a preferred quarterly period is invalid', () => {
    expect(resolveQuarterlyDefaultPeriodKey('2026-04', '2026-Q2')).toBe('2026-Q2')
    expect(resolveQuarterlyDefaultPeriodKey('2026-q3', '2026-Q2')).toBe('2026-Q3')
  })

  it('opens the next quarter from the 25th of the last quarter month', () => {
    expect(getQuarterlyPaymentOpenPeriodKey(dayjs('2026-06-24'))).toBe('2026-Q2')
    expect(getQuarterlyPaymentOpenPeriodKey(dayjs('2026-06-25'))).toBe('2026-Q3')
    expect(getQuarterlyPaymentOpenPeriodKey(dayjs('2026-12-25'))).toBe('2027-Q1')
  })

  it('keeps past quarters payable but blocks unopened future quarters', () => {
    expect(getQuarterlyPeriodIndex('2026-Q3')).toBe(8107)
    expect(isQuarterlyPaymentPeriodOpen('2026-Q2', dayjs('2026-06-24'))).toBe(true)
    expect(isQuarterlyPaymentPeriodOpen('2026-Q3', dayjs('2026-06-24'))).toBe(false)
    expect(isQuarterlyPaymentPeriodOpen('2026-Q3', dayjs('2026-06-25'))).toBe(true)
    expect(isQuarterlyPaymentPeriodOpen('2026-Q4', dayjs('2026-06-25'))).toBe(false)
  })

  it('does not allow grouped quarterly submissions to mix with other payment types', () => {
    expect(canUseGroupedQuarterlyPaymentSubmission(2, {
      billingMode: 'quarterly',
      selectedEquipmentCount: 0,
      selectedMatchFeeCount: 0
    })).toBe(true)

    expect(canUseGroupedQuarterlyPaymentSubmission(2, {
      billingMode: 'quarterly',
      selectedEquipmentCount: 1,
      selectedMatchFeeCount: 0
    })).toBe(false)

    expect(canUseGroupedQuarterlyPaymentSubmission(2, {
      billingMode: 'monthly',
      selectedEquipmentCount: 0,
      selectedMatchFeeCount: 0
    })).toBe(false)
  })
})
