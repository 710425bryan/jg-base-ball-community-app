export type TrainingProgramSetting = {
  program_key: string
  label: string
  team_group: string | null
  default_weekdays: number[]
  default_start_time: string | null
  default_end_time: string | null
  default_venue_name: string | null
  default_venue_address: string | null
  default_venue_maps_url: string | null
  sort_order: number
  is_active: boolean
  created_at: string | null
  updated_at: string | null
}

export type TrainingProgramSettingSaveInput = {
  program_key: string
  label: string
  team_group?: string | null
  default_weekdays: number[]
  default_start_time?: string | null
  default_end_time?: string | null
  default_venue_name?: string | null
  default_venue_address?: string | null
  default_venue_maps_url?: string | null
  sort_order?: number | null
  is_active?: boolean | null
}

export type TrainingProgramMemberLike = {
  role?: string | null
  team_group?: string | null
  training_program?: string | null
  fee_billing_mode?: string | null
}
