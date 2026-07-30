import {
  getActiveSiblingIds,
  shouldApplyManualHalfPrice,
  type SiblingDiscountMember
} from './memberLifecycle'

export type MonthlyFeeDiscountMember = SiblingDiscountMember & {
  is_primary_payer?: boolean | null
}

export const shouldApplyMonthlyFeeDiscount = (
  member: MonthlyFeeDiscountMember,
  members: MonthlyFeeDiscountMember[]
) => {
  if (shouldApplyManualHalfPrice(member, members)) {
    return true
  }

  if (member.is_primary_payer) {
    return false
  }

  const memberMap = new Map(members.map((item) => [item.id, item]))
  const activeSiblings = getActiveSiblingIds(member, members)
    .map((id) => memberMap.get(id))
    .filter((sibling): sibling is MonthlyFeeDiscountMember => Boolean(sibling))

  if (activeSiblings.length === 0) {
    return false
  }

  if (activeSiblings.some((sibling) => sibling.is_primary_payer)) {
    return true
  }

  // 舊資料若沒有指定主要繳費人，沿用 UUID 排序確保同一家族只有後順位成員折半。
  return activeSiblings.some((sibling) => member.id > sibling.id)
}
