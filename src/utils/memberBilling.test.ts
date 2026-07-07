import { describe, expect, it } from 'vitest'
import {
  calculateDiscountedPerSessionFee,
  calculateFixedMonthlyPayableAmount,
  calculatePerSessionMonthlyPayableAmount,
  DEFAULT_FIXED_MONTHLY_FEE,
  getEffectivePaymentBillingMode,
  getMemberBillingLabel,
  getMonthlyFeeCalculationType,
  isFixedMonthlyBillingMember,
  isNoFeeBillingMember,
  normalizeFixedMonthlyFee,
  normalizeMemberFeeBillingMode
} from './memberBilling'

describe('memberBilling', () => {
  it('defaults unknown billing mode to role_default', () => {
    expect(normalizeMemberFeeBillingMode(null)).toBe('role_default')
    expect(normalizeMemberFeeBillingMode('unexpected')).toBe('role_default')
    expect(normalizeMemberFeeBillingMode('monthly_fixed')).toBe('monthly_fixed')
    expect(normalizeMemberFeeBillingMode('monthly_per_session')).toBe('monthly_per_session')
    expect(normalizeMemberFeeBillingMode('no_fee')).toBe('no_fee')
  })

  it('treats fixed monthly players as monthly billing while keeping their role as player', () => {
    const fixedPlayer = { role: '球員', fee_billing_mode: 'monthly_fixed' }

    expect(isFixedMonthlyBillingMember(fixedPlayer)).toBe(true)
    expect(getEffectivePaymentBillingMode(fixedPlayer)).toBe('monthly')
    expect(getMonthlyFeeCalculationType(fixedPlayer)).toBe('monthly_fixed')
    expect(getMemberBillingLabel(fixedPlayer)).toBe('社區月繳')
  })

  it('treats Xintai school team members as fixed monthly billing', () => {
    const xintaiSchoolMember = {
      role: '校隊',
      fee_billing_mode: 'role_default',
      training_program: 'junior_high_school_team'
    }
    const chunggangSchoolMember = {
      role: '校隊',
      fee_billing_mode: 'role_default',
      training_program: 'chunggang_school_team'
    }
    const schoolMemberWithoutProgram = {
      role: '校隊',
      fee_billing_mode: 'role_default'
    }

    expect(isFixedMonthlyBillingMember(xintaiSchoolMember)).toBe(true)
    expect(getEffectivePaymentBillingMode(xintaiSchoolMember)).toBe('monthly')
    expect(getMonthlyFeeCalculationType(xintaiSchoolMember)).toBe('monthly_fixed')
    expect(getMemberBillingLabel(xintaiSchoolMember)).toBe('新泰月繳')
    expect(isFixedMonthlyBillingMember(chunggangSchoolMember)).toBe(false)
    expect(getMonthlyFeeCalculationType(chunggangSchoolMember)).toBe('per_session')
    expect(getMemberBillingLabel(chunggangSchoolMember)).toBe('校隊月繳')
    expect(isFixedMonthlyBillingMember(schoolMemberWithoutProgram)).toBe(false)
    expect(getMonthlyFeeCalculationType(schoolMemberWithoutProgram)).toBe('per_session')
  })

  it('keeps normal players on quarterly billing', () => {
    const quarterlyPlayer = { role: '球員', fee_billing_mode: 'role_default' }

    expect(isFixedMonthlyBillingMember(quarterlyPlayer)).toBe(false)
    expect(getEffectivePaymentBillingMode(quarterlyPlayer)).toBe('quarterly')
    expect(getMemberBillingLabel(quarterlyPlayer)).toBe('球員季繳')
  })

  it('treats per-session monthly players as monthly billing without fixed monthly calculation', () => {
    const perSessionPlayer = { role: '球員', fee_billing_mode: 'monthly_per_session' }

    expect(isFixedMonthlyBillingMember(perSessionPlayer)).toBe(false)
    expect(getEffectivePaymentBillingMode(perSessionPlayer)).toBe('monthly')
    expect(getMonthlyFeeCalculationType(perSessionPlayer)).toBe('per_session')
    expect(getMemberBillingLabel(perSessionPlayer)).toBe('計次月費')
  })

  it('treats no-fee school team members and players as non-billable', () => {
    const noFeePlayer = { role: '球員', fee_billing_mode: 'no_fee' }
    const noFeeSchoolMember = { role: '校隊', fee_billing_mode: 'no_fee' }
    const noFeeXintaiSchoolMember = {
      role: '校隊',
      fee_billing_mode: 'no_fee',
      training_program: 'junior_high_school_team'
    }

    expect(isNoFeeBillingMember(noFeePlayer)).toBe(true)
    expect(isNoFeeBillingMember(noFeeSchoolMember)).toBe(true)
    expect(isNoFeeBillingMember(noFeeXintaiSchoolMember)).toBe(true)
    expect(getEffectivePaymentBillingMode(noFeePlayer)).toBe('none')
    expect(getEffectivePaymentBillingMode(noFeeSchoolMember)).toBe('none')
    expect(isFixedMonthlyBillingMember(noFeeXintaiSchoolMember)).toBe(false)
    expect(getMonthlyFeeCalculationType(noFeeXintaiSchoolMember)).toBe('per_session')
    expect(getMemberBillingLabel(noFeePlayer)).toBe('不收費')
    expect(getMemberBillingLabel(noFeeSchoolMember)).toBe('不收費')
    expect(getMemberBillingLabel(noFeeXintaiSchoolMember)).toBe('不收費')
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

  it('applies half-price discounts to the per-session fee before monthly calculation', () => {
    expect(calculateDiscountedPerSessionFee(500, true)).toBe(250)
    expect(calculateDiscountedPerSessionFee(500, false)).toBe(500)
    expect(calculatePerSessionMonthlyPayableAmount(3, 1, calculateDiscountedPerSessionFee(500, true), 0)).toBe(500)
  })
})
