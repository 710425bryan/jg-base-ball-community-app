import { describe, expect, it } from 'vitest'
import type { MatchFeeItem } from '@/types/matchFees'
import {
  getPayableMatchFeeItems,
  isClosedMatchFeeHistory,
  isMatchFeeItemPayable,
  isUnopenedMatchFeeItem
} from './matchFeePaymentAvailability'

const makeItem = (overrides: Partial<MatchFeeItem> = {}): MatchFeeItem => ({
  id: 'item-1',
  match_id: 'match-1',
  member_id: 'member-1',
  member_name: '王小明',
  match_name: '測試比賽',
  tournament_name: null,
  match_date: '2026-07-20',
  match_time: '09:00 - 10:30',
  category_group: null,
  fee_month: '2026-07',
  amount: 100,
  payment_status: 'unpaid',
  payment_submission_id: null,
  paid_at: null,
  cancelled_reason: null,
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-01T00:00:00Z',
  ...overrides
})

describe('match fee payment availability', () => {
  it('only treats an opened unpaid item as payable', () => {
    expect(isMatchFeeItemPayable(makeItem({ payment_opened_at: '2026-07-01T00:00:00Z' }))).toBe(true)
    expect(isMatchFeeItemPayable(makeItem({ payment_opened_at: null }))).toBe(false)
    expect(isMatchFeeItemPayable(makeItem({ payment_status: 'pending_review', payment_opened_at: '2026-07-01T00:00:00Z' }))).toBe(false)
    expect(isMatchFeeItemPayable(makeItem({ payment_status: 'paid', payment_opened_at: '2026-07-01T00:00:00Z' }))).toBe(false)
    expect(isMatchFeeItemPayable(makeItem({ payment_status: 'cancelled', payment_opened_at: '2026-07-01T00:00:00Z' }))).toBe(false)
  })

  it('identifies only unpaid items that have never been opened or paid as unopened', () => {
    expect(isUnopenedMatchFeeItem(makeItem({
      payment_opened_at: null,
      has_payment_history: false
    }))).toBe(true)
    expect(isUnopenedMatchFeeItem(makeItem({
      payment_opened_at: null,
      has_payment_history: undefined
    }))).toBe(true)
    expect(isUnopenedMatchFeeItem(makeItem({
      payment_opened_at: '2026-07-01T00:00:00Z',
      has_payment_history: false
    }))).toBe(false)
    expect(isUnopenedMatchFeeItem(makeItem({
      payment_opened_at: null,
      has_payment_history: true
    }))).toBe(false)
    expect(isUnopenedMatchFeeItem(makeItem({
      payment_status: 'pending_review',
      payment_opened_at: null,
      has_payment_history: false
    }))).toBe(false)
    expect(isUnopenedMatchFeeItem(makeItem({
      payment_status: 'paid',
      payment_opened_at: null,
      has_payment_history: false
    }))).toBe(false)
    expect(isUnopenedMatchFeeItem(makeItem({
      payment_status: 'cancelled',
      payment_opened_at: null,
      has_payment_history: false
    }))).toBe(false)
  })

  it('identifies a closed unpaid item that is retained only for payment history', () => {
    expect(isClosedMatchFeeHistory(makeItem({
      payment_opened_at: null,
      has_payment_history: true
    }))).toBe(true)
    expect(isClosedMatchFeeHistory(makeItem({
      payment_opened_at: null,
      has_payment_history: false
    }))).toBe(false)
  })

  it('filters unopened, closed, pending, paid and cancelled rows out of combined payment choices', () => {
    expect(getPayableMatchFeeItems([
      makeItem({ id: 'opened', payment_opened_at: '2026-07-01T00:00:00Z' }),
      makeItem({ id: 'unopened', payment_opened_at: null, has_payment_history: false }),
      makeItem({ id: 'closed', payment_opened_at: null, has_payment_history: true }),
      makeItem({ id: 'pending', payment_status: 'pending_review', payment_opened_at: '2026-07-01T00:00:00Z' }),
      makeItem({ id: 'paid', payment_status: 'paid', payment_opened_at: '2026-07-01T00:00:00Z' }),
      makeItem({ id: 'cancelled', payment_status: 'cancelled', payment_opened_at: null })
    ]).map((item) => item.id)).toEqual(['opened'])
  })
})
