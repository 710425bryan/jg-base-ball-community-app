interface UserRoleOption {
  role_key: string
  weight?: number | null
}

const fallbackRoles: UserRoleOption[] = [
  { role_key: 'ADMIN', weight: 1 },
  { role_key: 'MANAGER', weight: 9 },
  { role_key: 'HEAD_COACH', weight: 10 },
  { role_key: 'SCHEDULINGCOACH', weight: 15 },
  { role_key: 'COACH', weight: 16 },
  { role_key: 'FINANCE', weight: 20 },
  { role_key: 'COMMITTEE', weight: 21 },
  { role_key: 'MEMBER', weight: 99 }
]

export const getRoleWeight = (role: UserRoleOption): number =>
  typeof role.weight === 'number' && Number.isInteger(role.weight) && role.weight > 0 ? role.weight : 99

const compareKeys = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0

export const sortUserRoles = <T extends UserRoleOption>(roles: readonly T[]): T[] =>
  [...roles].sort((a, b) => getRoleWeight(a) - getRoleWeight(b) || compareKeys(a.role_key, b.role_key))

export const getUserRoleOrder = (roles: readonly UserRoleOption[]): Map<string, number> =>
  new Map(sortUserRoles(roles.length > 0 ? roles : fallbackRoles).map((role) => [role.role_key, getRoleWeight(role)]))

export const compareUserRoleKeys = (a: string, b: string, weights: ReadonlyMap<string, number>): number =>
  (weights.get(a) ?? 99) - (weights.get(b) ?? 99) || compareKeys(a, b)
