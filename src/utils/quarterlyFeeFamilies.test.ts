import { describe, expect, it } from 'vitest'
import { buildSiblingGroupMap } from './siblingGroups'
import {
  FULL_QUARTERLY_FEE_AMOUNT,
  HALF_QUARTERLY_FEE_AMOUNT,
  filterQuarterlyPricingMembers,
  getQuarterlyFeeExternalAmount,
  getExpectedQuarterlyAmount,
  groupQuarterlyFeeRecordsByPayment,
  sumQuarterlyFeeGroupBalanceAmount,
  sumQuarterlyFeeGroupAmount
} from './quarterlyFeeFamilies'

describe('quarterlyFeeFamilies', () => {
  it('assigns one full-price sibling and discounts the rest when a primary payer exists', () => {
    const members = [
      { id: 'lin-1', sibling_ids: ['lin-2'], is_primary_payer: true, is_half_price: false },
      { id: 'lin-2', sibling_ids: ['lin-1'], is_primary_payer: false, is_half_price: false }
    ]
    const siblingGroupMap = buildSiblingGroupMap(members)

    expect(getExpectedQuarterlyAmount(members[0], members, siblingGroupMap)).toBe(FULL_QUARTERLY_FEE_AMOUNT)
    expect(getExpectedQuarterlyAmount(members[1], members, siblingGroupMap)).toBe(HALF_QUARTERLY_FEE_AMOUNT)
  })

  it('falls back to the lexicographically first sibling as the full-price payer', () => {
    const members = [
      { id: 'family-b', sibling_ids: ['family-a'], is_primary_payer: false, is_half_price: false },
      { id: 'family-a', sibling_ids: ['family-b', 'family-c'], is_primary_payer: false, is_half_price: false },
      { id: 'family-c', sibling_ids: ['family-a'], is_primary_payer: false, is_half_price: false }
    ]
    const siblingGroupMap = buildSiblingGroupMap(members)

    expect(getExpectedQuarterlyAmount(members[0], members, siblingGroupMap)).toBe(HALF_QUARTERLY_FEE_AMOUNT)
    expect(getExpectedQuarterlyAmount(members[1], members, siblingGroupMap)).toBe(FULL_QUARTERLY_FEE_AMOUNT)
    expect(getExpectedQuarterlyAmount(members[2], members, siblingGroupMap)).toBe(HALF_QUARTERLY_FEE_AMOUNT)
  })

  it('respects manual half-price flags even when the player is the only sibling record loaded', () => {
    const members = [
      { id: 'solo-half', sibling_ids: [], is_primary_payer: false, is_half_price: true }
    ]
    const siblingGroupMap = buildSiblingGroupMap(members)

    expect(getExpectedQuarterlyAmount(members[0], members, siblingGroupMap)).toBe(HALF_QUARTERLY_FEE_AMOUNT)
  })

  it('excludes fixed monthly players from quarterly sibling pricing', () => {
    const members = [
      {
        id: 'quarterly-player',
        role: '球員',
        fee_billing_mode: 'role_default',
        sibling_ids: ['fixed-player'],
        is_primary_payer: false,
        is_half_price: false
      },
      {
        id: 'fixed-player',
        role: '球員',
        fee_billing_mode: 'monthly_fixed',
        sibling_ids: ['quarterly-player'],
        is_primary_payer: true,
        is_half_price: false
      }
    ]
    const quarterlyMembers = filterQuarterlyPricingMembers(members)
    const quarterlySiblingGroupMap = buildSiblingGroupMap(quarterlyMembers)

    expect(quarterlyMembers.map((member) => member.id)).toEqual(['quarterly-player'])
    expect(getExpectedQuarterlyAmount(quarterlyMembers[0], quarterlyMembers, quarterlySiblingGroupMap)).toBe(FULL_QUARTERLY_FEE_AMOUNT)
    expect(getExpectedQuarterlyAmount(members[1], members, buildSiblingGroupMap(members))).toBe(0)
  })

  it('groups sibling payment rows into a single family payment summary', () => {
    const siblingGroupMap = buildSiblingGroupMap([
      { id: 'wang-1', sibling_ids: ['wang-2'] },
      { id: 'wang-2', sibling_ids: ['wang-1'] }
    ])

    const groupedRecords = groupQuarterlyFeeRecordsByPayment([
      {
        id: 'fee-1',
        member_id: 'wang-1',
        member_ids: ['wang-1', 'wang-2'],
        year_quarter: '2026-Q2',
        status: 'unpaid',
        payment_method: '匯款',
        remittance_date: '2026-04-13',
        payment_items: ['學費(季繳$6000/3000)'],
        amount: 6000,
        balance_amount: 1000
      },
      {
        id: 'fee-2',
        member_id: 'wang-2',
        member_ids: ['wang-1', 'wang-2'],
        year_quarter: '2026-Q2',
        status: 'unpaid',
        payment_method: '匯款',
        remittance_date: '2026-04-13',
        payment_items: ['學費(季繳$6000/3000)'],
        amount: 3000,
        balance_amount: 500
      }
    ], siblingGroupMap)

    expect(groupedRecords).toHaveLength(1)
    expect(groupedRecords[0].linkedMemberIds).toEqual(['wang-1', 'wang-2'])
    expect(sumQuarterlyFeeGroupAmount(groupedRecords[0].records)).toBe(9000)
    expect(sumQuarterlyFeeGroupBalanceAmount(groupedRecords[0].records)).toBe(1500)
    expect(getQuarterlyFeeExternalAmount(groupedRecords[0].records[0])).toBe(5000)
  })
})
