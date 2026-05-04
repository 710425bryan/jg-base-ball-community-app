export interface TeamGroupSetting {
  id: string
  name: string
  sort_order: number
  member_count: number
  created_at: string | null
  updated_at: string | null
}

export interface TeamGroupOption extends TeamGroupSetting {
  label: string
  value: string
  accentClass: string
  badgeClass: string
}

export interface DeleteTeamGroupResult {
  deleted_name: string
  transferred_to_name: string | null
  transferred_member_count: number
}
