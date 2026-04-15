import { describe, expect, it } from 'vitest'
import { buildSiblingGroupMap } from './siblingGroups'
import {
  FULL_QUARTERLY_FEE_AMOUNT,
  HALF_QUARTERLY_FEE_AMOUNT,
  getExpectedQuarterlyAmount,
  groupQuarterlyFeeRecordsByPayment,
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
        amount: 6000
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
        amount: 3000
      }
    ], siblingGroupMap)

    expect(groupedRecords).toHaveLength(1)
    expect(groupedRecords[0].linkedMemberIds).toEqual(['wang-1', 'wang-2'])
    expect(sumQuarterlyFeeGroupAmount(groupedRecords[0].records)).toBe(9000)
  })
})
