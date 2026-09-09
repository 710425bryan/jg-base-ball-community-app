export interface PlayerIdentityMember {
  role?: string | null
  member_identity_label?: string | null
  training_program?: string | null
  team_group?: string | null
  fee_billing_mode?: string | null
}

export interface PlayerIdentityOption {
  label: string
  value: string
}
