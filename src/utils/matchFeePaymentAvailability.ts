import type { MatchFeeItem } from '@/types/matchFees'

export const isMatchFeeItemPayable = (item: MatchFeeItem) =>
  item.payment_status === 'unpaid' && Boolean(item.payment_opened_at)

export const isClosedMatchFeeHistory = (item: MatchFeeItem) =>
  item.payment_status === 'unpaid'
  && !item.payment_opened_at
  && item.has_payment_history === true

export const getPayableMatchFeeItems = (items: MatchFeeItem[]) =>
  items.filter(isMatchFeeItemPayable)
