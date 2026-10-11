export const GENERAL_MEMBER_ROLE_FALLBACK = 'MEMBER'

const GENERAL_MEMBER_ROLE_CANDIDATE_KEYS = ['MEMBER', 'PARENT', 'GENERAL_MEMBER'] as const

export const resolveGeneralMemberRoleKeyFromRoles = (
  roles: readonly { role_key: string }[]
): string => {
  // Display names are editable and must never select a new account's permissions.
  const availableKeys = new Set(roles.map((role) => role.role_key))
  return GENERAL_MEMBER_ROLE_CANDIDATE_KEYS.find((key) => availableKeys.has(key)) || ''
}
