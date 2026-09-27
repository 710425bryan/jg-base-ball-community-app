import { describe, expect, it } from 'vitest'
import { getEffectivePaymentBillingMode } from './memberBilling'
import { getPlayerMatchBillingForm, getPlayerMatchFeeEnabled, getPlayerMatchFeeLabel } from './playerMatchBilling'

describe('independent player match billing', () => {
  it.each(['球員', '校隊'])('keeps legacy defaults for %s', (role) => {
    expect(getPlayerMatchFeeEnabled({ role, fee_billing_mode: 'no_fee' })).toBe(false)
    expect(getPlayerMatchFeeEnabled({ role, fee_billing_mode: 'role_default' })).toBe(true)
  })
  it('allows match fees without introducing membership fees', () => {
    const member = { role: '球員', fee_billing_mode: 'no_fee', match_fee_enabled: true }
    expect(getEffectivePaymentBillingMode(member)).toBe('none')
    expect(getPlayerMatchFeeEnabled(member)).toBe(true)
    expect(getPlayerMatchFeeLabel(member)).toBe('比賽依參賽收費')
  })
  it('allows membership fees without match fees', () => {
    const member = { role: '球員', fee_billing_mode: 'monthly_fixed', match_fee_enabled: false }
    expect(getEffectivePaymentBillingMode(member)).toBe('monthly')
    expect(getPlayerMatchFeeLabel(member)).toBe('免收比賽費')
  })
  it('hydrates the persisted setting and date independently from team fees', () => {
    expect(getPlayerMatchBillingForm({ role: '球員', fee_billing_mode: 'no_fee', match_fee_enabled: true, match_fee_start_date: '2026-09-27' }))
      .toEqual({ match_fee_enabled: true, match_fee_start_date: '2026-09-27' })
    expect(getPlayerMatchBillingForm({ role: '球員', fee_billing_mode: 'no_fee' }))
      .toEqual({ match_fee_enabled: false, match_fee_start_date: null })
  })
  it('does not make staff eligible for match billing', () => {
    expect(getPlayerMatchFeeEnabled({ role: '教練', match_fee_enabled: true })).toBe(false)
  })
})
