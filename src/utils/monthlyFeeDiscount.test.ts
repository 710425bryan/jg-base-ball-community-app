import { describe, expect, it } from 'vitest'
import { shouldApplyMonthlyFeeDiscount } from './monthlyFeeDiscount'

describe('shouldApplyMonthlyFeeDiscount', () => {
  it('counts active siblings across different billing modes', () => {
    const members = [
      {
        id: 'school-team-member',
        role: '校隊',
        status: '在隊',
        is_inactive_or_graduated: false,
        is_half_price: true,
        is_primary_payer: false,
        sibling_ids: ['quarterly-primary']
      },
      {
        id: 'quarterly-primary',
        role: '球員',
        status: '在隊',
        is_inactive_or_graduated: false,
        is_half_price: false,
        is_primary_payer: true,
        sibling_ids: ['school-team-member']
      }
    ]

    expect(shouldApplyMonthlyFeeDiscount(members[0], members)).toBe(true)
  })

  it('does not keep a stale half-price flag when every referenced sibling is inactive', () => {
    const members = [
      {
        id: 'active-member',
        role: '校隊',
        status: '在隊',
        is_inactive_or_graduated: false,
        is_half_price: true,
        is_primary_payer: false,
        sibling_ids: ['inactive-sibling']
      },
      {
        id: 'inactive-sibling',
        role: '球員',
        status: '離隊',
        is_inactive_or_graduated: false,
        is_half_price: false,
        is_primary_payer: true,
        sibling_ids: ['active-member']
      }
    ]

    expect(shouldApplyMonthlyFeeDiscount(members[0], members)).toBe(false)
  })

  it('keeps the legacy deterministic fallback when no primary payer is configured', () => {
    const members = [
      {
        id: 'a-member',
        role: '球員',
        status: '在隊',
        is_inactive_or_graduated: false,
        is_half_price: false,
        is_primary_payer: false,
        sibling_ids: ['b-member']
      },
      {
        id: 'b-member',
        role: '校隊',
        status: '在隊',
        is_inactive_or_graduated: false,
        is_half_price: false,
        is_primary_payer: false,
        sibling_ids: ['a-member']
      }
    ]

    expect(shouldApplyMonthlyFeeDiscount(members[0], members)).toBe(false)
    expect(shouldApplyMonthlyFeeDiscount(members[1], members)).toBe(true)
  })
})
