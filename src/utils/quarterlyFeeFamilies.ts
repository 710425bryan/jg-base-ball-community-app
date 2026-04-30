import { getSiblingGroupIds, resolveLinkedMemberIds, type SiblingNode } from './siblingGroups'
import { isQuarterlyBillingMember } from './memberBilling'

export const FULL_QUARTERLY_FEE_AMOUNT = 6000
export const HALF_QUARTERLY_FEE_AMOUNT = 3000

export type QuarterlyPricingMember = SiblingNode & {
  role?: string | null
  fee_billing_mode?: string | null
  is_half_price?: boolean | null
  is_primary_payer?: boolean | null
}

export type QuarterlyFeeGroupingRecord = {
  amount?: number | null
  balance_amount?: number | null
  member_id?: string | null
  member_ids?: string[] | null
  year_quarter?: string | null
  status?: string | null
  payment_method?: string | null
  remittance_date?: string | null
  account_last_5?: string | null
  payment_items?: string[] | null
  other_item_note?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type GroupedQuarterlyFeeRecords<T> = {
  groupKey: string
  linkedMemberIds: string[]
  records: T[]
}

const sortIds = (ids: string[]) =>
  [...new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0))].sort((left, right) =>
    left.localeCompare(right)
  )

const normalizePaymentItems = (paymentItems: string[] | null | undefined) =>
  [...new Set((paymentItems || []).filter((item): item is string => typeof item === 'string' && item.trim().length > 0))]
    .sort((left, right) => left.localeCompare(right))

const getFamilyMembers = (
  memberId: string,
  members: QuarterlyPricingMember[],
  siblingGroupMap: Map<string, string[]>
) => {
  const memberMap = new Map(members.map((member) => [member.id, member]))
  const familyIds = getSiblingGroupIds(memberId, siblingGroupMap)

  return familyIds
    .map((id) => memberMap.get(id))
    .filter((member): member is QuarterlyPricingMember => {
      if (!member) return false
      return isQuarterlyPricingMember(member)
    })
}

export const isQuarterlyPricingMember = (member: QuarterlyPricingMember) => {
  if (member.role === undefined || member.role === null) {
    return member.fee_billing_mode !== 'monthly_fixed'
  }

  return isQuarterlyBillingMember(member)
}

export const filterQuarterlyPricingMembers = <T extends QuarterlyPricingMember>(members: T[]) =>
  members.filter((member): member is T => isQuarterlyPricingMember(member))

const getCanonicalPrimaryPayerId = (familyMembers: QuarterlyPricingMember[]) => {
  const eligiblePrimaryMembers = familyMembers
    .filter((member) => member.is_primary_payer && !member.is_half_price)
    .map((member) => member.id)
    .sort((left, right) => left.localeCompare(right))

  if (eligiblePrimaryMembers.length > 0) {
    return eligiblePrimaryMembers[0]
  }

  return familyMembers
    .map((member) => member.id)
    .sort((left, right) => left.localeCompare(right))[0] ?? null
}

export const getExpectedQuarterlyAmount = (
  member: QuarterlyPricingMember,
  members: QuarterlyPricingMember[],
  siblingGroupMap: Map<string, string[]>
) => {
  if (!isQuarterlyPricingMember(member)) {
    return 0
  }

  if (member.is_half_price) {
    return HALF_QUARTERLY_FEE_AMOUNT
  }

  const familyMembers = getFamilyMembers(member.id, members, siblingGroupMap)

  if (familyMembers.length <= 1) {
    return FULL_QUARTERLY_FEE_AMOUNT
  }

  const primaryPayerId = getCanonicalPrimaryPayerId(familyMembers)
  return member.id === primaryPayerId
    ? FULL_QUARTERLY_FEE_AMOUNT
    : HALF_QUARTERLY_FEE_AMOUNT
}

export const buildQuarterlyFamilyKey = (linkedMemberIds: string[]) => sortIds(linkedMemberIds).join('|')

export const buildQuarterlyRecordFamilyKey = (
  record: Pick<QuarterlyFeeGroupingRecord, 'member_id' | 'member_ids'>,
  siblingGroupMap: Map<string, string[]>
) => buildQuarterlyFamilyKey(resolveLinkedMemberIds(record, siblingGroupMap))

export const buildQuarterlyPaymentGroupKey = (
  record: QuarterlyFeeGroupingRecord,
  siblingGroupMap: Map<string, string[]>
) => {
  const linkedMemberIds = resolveLinkedMemberIds(record, siblingGroupMap)

  return JSON.stringify({
    yearQuarter: record.year_quarter || '',
    linkedMemberIds: sortIds(linkedMemberIds),
    status: record.status || '',
    paymentMethod: record.payment_method || '',
    remittanceDate: record.remittance_date || '',
    accountLast5: record.account_last_5 || '',
    paymentItems: normalizePaymentItems(record.payment_items),
    otherItemNote: record.other_item_note || ''
  })
}

export const groupQuarterlyFeeRecordsByPayment = <T extends QuarterlyFeeGroupingRecord>(
  records: T[],
  siblingGroupMap: Map<string, string[]>
): GroupedQuarterlyFeeRecords<T>[] => {
  const groupedRecords = new Map<string, GroupedQuarterlyFeeRecords<T>>()

  records.forEach((record) => {
    const groupKey = buildQuarterlyPaymentGroupKey(record, siblingGroupMap)
    const linkedMemberIds = resolveLinkedMemberIds(record, siblingGroupMap)
    const currentGroup = groupedRecords.get(groupKey)

    if (currentGroup) {
      currentGroup.records.push(record)
      return
    }

    groupedRecords.set(groupKey, {
      groupKey,
      linkedMemberIds,
      records: [record]
    })
  })

  return [...groupedRecords.values()]
}

export const selectLatestQuarterlyRecord = <
  T extends Pick<QuarterlyFeeGroupingRecord, 'created_at' | 'updated_at'> & { id?: string | number | null }
>(records: T[]) =>
  [...records].sort((left, right) => {
    const rightTime = new Date(right.updated_at || right.created_at || 0).getTime()
    const leftTime = new Date(left.updated_at || left.created_at || 0).getTime()

    if (rightTime !== leftTime) {
      return rightTime - leftTime
    }

    return String(right.id || '').localeCompare(String(left.id || ''))
  })[0] ?? null

export const sumQuarterlyFeeGroupAmount = <T extends Pick<QuarterlyFeeGroupingRecord, 'amount'>>(records: T[]) =>
  records.reduce((sum, record) => sum + (Number(record.amount) || 0), 0)

export const sumQuarterlyFeeGroupBalanceAmount = <
  T extends Pick<QuarterlyFeeGroupingRecord, 'balance_amount'>
>(records: T[]) =>
  records.reduce((sum, record) => sum + (Number(record.balance_amount) || 0), 0)

export const getQuarterlyFeeExternalAmount = (
  record: Pick<QuarterlyFeeGroupingRecord, 'amount' | 'balance_amount'>
) => Math.max(0, (Number(record.amount) || 0) - (Number(record.balance_amount) || 0))
