interface AppRoleDisplayOption {
  role_key: string
  role_name?: string | null
}

export const getAppRoleDisplayName = (
  roleKey: string | null | undefined,
  roles: readonly AppRoleDisplayOption[],
  fallbackName: string
): string => {
  if (!roleKey) return fallbackName

  return roles.find((role) => role.role_key === roleKey)?.role_name?.trim() || fallbackName
}
