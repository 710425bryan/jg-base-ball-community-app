import { describe, expect, it } from 'vitest'
import {
  calculateFixedMonthlyPayableAmount,
  calculatePerSessionMonthlyPayableAmount,
  DEFAULT_FIXED_MONTHLY_FEE,
  getEffectivePaymentBillingMode,
  getMemberBillingLabel,
  getMonthlyFeeCalculationType,
  isFixedMonthlyBillingMember,
  normalizeFixedMonthlyFee,
  normalizeMemberFeeBillingMode
} from './memberBilling'

describe('memberBilling', () => {
  it('defaults unknown billing mode to role_default', () => {
    expect(normalizeMemberFeeBillingMode(null)).toBe('role_default')
    expect(normalizeMemberFeeBillingMode('unexpected')).toBe('role_default')
    expect(normalizeMemberFeeBillingMode('monthly_fixed')).toBe('monthly_fixed')
  })

  it('treats fixed monthly players as monthly billing while keeping their role as player', () => {
    const fixedPlayer = { role: '球員', fee_billing_mode: 'monthly_fixed' }

    expect(isFixedMonthlyBillingMember(fixedPlayer)).toBe(true)
    expect(getEffectivePaymentBillingMode(fixedPlayer)).toBe('monthly')
    expect(getMonthlyFeeCalculationType(fixedPlayer)).toBe('monthly_fixed')
    expect(getMemberBillingLabel(fixedPlayer)).toBe('社區月繳')
  })

  it('keeps normal players on quarterly billing', () => {
    const quarterlyPlayer = { role: '球員', fee_billing_mode: 'role_default' }

    expect(isFixedMonthlyBillingMember(quarterlyPlayer)).toBe(false)
    expect(getEffectivePaymentBillingMode(quarterlyPlayer)).toBe('quarterly')
    expect(getMemberBillingLabel(quarterlyPlayer)).toBe('球員季繳')
  })

  it('uses 2000 as the fixed monthly default and allows explicit overrides', () => {
    expect(normalizeFixedMonthlyFee(null)).toBe(DEFAULT_FIXED_MONTHLY_FEE)
    expect(normalizeFixedMonthlyFee(undefined)).toBe(DEFAULT_FIXED_MONTHLY_FEE)
    expect(normalizeFixedMonthlyFee(2500)).toBe(2500)
    expect(normalizeFixedMonthlyFee(0)).toBe(0)
  })

  it('calculates fixed monthly payable without sessions, leave days, or per-session fee', () => {
    expect(calculateFixedMonthlyPayableAmount(2000, 0)).toBe(2000)
    expect(calculateFixedMonthlyPayableAmount(2000, 300)).toBe(1700)
    expect(calculateFixedMonthlyPayableAmount(2000, -200)).toBe(2200)
  })

  it('keeps per-session calculation separate from fixed monthly calculation', () => {
    expect(calculatePerSessionMonthlyPayableAmount(4, 1, 500, 0)).toBe(1500)
    expect(calculatePerSessionMonthlyPayableAmount(4, 1, 250, 100)).toBe(650)
  })
})
