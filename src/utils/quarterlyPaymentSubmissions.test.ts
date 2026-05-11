import { describe, expect, it } from 'vitest'
import {
  canUseGroupedQuarterlyPaymentSubmission,
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
