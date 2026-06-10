import { buildSiblingGroupMap, getSiblingGroupIds, type SiblingNode } from './siblingGroups'

export type MemberLifecycleState = {
  id?: string | null
  role?: string | null
  status?: string | null
  is_inactive_or_graduated?: boolean | null
}

export type SiblingDiscountMember = SiblingNode & MemberLifecycleState & {
  is_half_price?: boolean | null
}

export const isActiveRosterMember = (member: MemberLifecycleState) =>
  member.status !== '退隊' &&
  member.status !== '離隊' &&
  member.is_inactive_or_graduated !== true

export const isSiblingLifecycleEligibleRole = (role?: string | null) =>
  role === '球員' || role === '校隊'

export const isActiveSiblingMember = (member: MemberLifecycleState) =>
  isActiveRosterMember(member) && isSiblingLifecycleEligibleRole(member.role)

export const hasSiblingReferences = (member: SiblingNode) =>
  Array.isArray(member.sibling_ids) &&
  member.sibling_ids.some((id) => typeof id === 'string' && id.trim().length > 0)

export const getActiveSiblingIds = <T extends SiblingDiscountMember>(
  member: T,
  members: T[]
) => {
  const memberMap = new Map(members.map((item) => [item.id, item]))

  return (Array.isArray(member.sibling_ids) ? member.sibling_ids : [])
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .filter((id) => {
      const sibling = memberMap.get(id)
      return Boolean(sibling && isActiveSiblingMember(sibling))
    })
}

export const shouldApplyManualHalfPrice = <T extends SiblingDiscountMember>(
  member: T,
  members: T[]
) =>
  member.is_half_price === true &&
  (!hasSiblingReferences(member) || getActiveSiblingIds(member, members).length > 0)

export const buildSiblingHalfPriceCleanupIds = <T extends SiblingDiscountMember>(
  changedMemberId: string | null | undefined,
  members: T[]
) => {
  if (!changedMemberId) return []

  const eligibleMembers = members.filter((member) => isSiblingLifecycleEligibleRole(member.role))
  const memberMap = new Map(eligibleMembers.map((member) => [member.id, member]))
  const changedMember = memberMap.get(changedMemberId)

  if (!changedMember || isActiveRosterMember(changedMember)) return []

  const siblingGroupMap = buildSiblingGroupMap(eligibleMembers)
  const familyIds = getSiblingGroupIds(changedMemberId, siblingGroupMap)
  const activeFamilyMembers = familyIds
    .map((id) => memberMap.get(id))
    .filter((member): member is T => Boolean(member && isActiveSiblingMember(member)))

  if (activeFamilyMembers.length !== 1) return []

  return activeFamilyMembers
    .filter((member) => member.is_half_price === true)
    .map((member) => member.id)
}
