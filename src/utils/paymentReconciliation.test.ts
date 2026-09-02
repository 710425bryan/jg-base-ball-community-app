import { describe, expect, it } from 'vitest'
import {
  getExpectedExternalPaymentAmount,
  reconcilePaymentAmounts,
  requiresPaymentMismatchReason
} from './paymentReconciliation'

describe('payment reconciliation', () => {
  it('keeps expected principal separate from a balance deduction', () => {
    expect(getExpectedExternalPaymentAmount(6000, 1000)).toBe(5000)
    expect(reconcilePaymentAmounts(6000, 1000, 5000)).toMatchObject({
      expectedAmount: 6000,
      expectedExternalAmount: 5000,
      amountDifference: 0,
      status: 'matched'
    })
  })

  it('classifies underpayment and overpayment from actual external payment', () => {
    expect(reconcilePaymentAmounts(6000, 1000, 4000)).toMatchObject({
      amountDifference: -1000,
      status: 'underpaid'
    })
    expect(reconcilePaymentAmounts(6000, 1000, 5500)).toMatchObject({
      amountDifference: 500,
      status: 'overpaid'
    })
    expect(requiresPaymentMismatchReason('underpaid')).toBe(true)
    expect(requiresPaymentMismatchReason('matched')).toBe(false)
  })

  it('marks missing expected snapshots as unverifiable', () => {
    expect(reconcilePaymentAmounts(null, 0, 1000)).toMatchObject({
      amountDifference: null,
      status: 'unverifiable'
    })
  })
})
