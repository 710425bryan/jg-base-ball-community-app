export interface AppRole {
  role_key: string
  role_name: string
  is_system: boolean
  weight: number | null
}

export interface CreateAppRoleInput {
  role_key: string
  role_name: string
  copy_from_role_key?: string | null
}
