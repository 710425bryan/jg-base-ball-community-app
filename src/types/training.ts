export type TrainingManualStatus = 'draft' | 'open' | 'paused' | 'closed' | 'finalized'

export type TrainingRegistrationStatus =
  | 'applied'
  | 'selected'
  | 'waitlisted'
  | 'rejected'
  | 'cancelled'

export type TrainingPointStatus = 'none' | 'reserved' | 'spent' | 'released'

export interface TrainingMember {
  member_id: string
  name: string
  role: string | null
  team_group: string | null
  point_balance: number
  reserved_points: number
  available_points: number
  active_block_count: number
}

export interface TrainingSelectedMember {
  member_id: string
  name: string
  role: string | null
  team_group: string | null
  jersey_number: string | number | null
}

export interface TrainingSession {
  session_id: string | null
  match_id: string
  match_name: string
  match_date: string
  match_time: string | null
  location: string | null
  category_group: string | null
  manual_status: TrainingManualStatus
  registration_start_at: string | null
  registration_end_at: string | null
  capacity: number | null
  point_cost: number
  published_at: string | null
  selected_count: number
  applied_count: number
  is_registration_open: boolean
  registration_id: string | null
  registration_status: TrainingRegistrationStatus | null
  point_status: TrainingPointStatus | null
  is_blocked: boolean
  block_reason: string | null
  selected_members: TrainingSelectedMember[]
}

export interface TrainingAdminRegistration {
  registration_id: string
  session_id: string
  member_id: string
  member_name: string
  member_role: string | null
  team_group: string | null
  jersey_number: string | null
  status: TrainingRegistrationStatus
  point_status: TrainingPointStatus
  note: string | null
  applied_by: string | null
  applied_by_name: string | null
  selected_by: string | null
  selected_at: string | null
  created_at: string
  point_balance: number
  reserved_points: number
  available_points: number
}

export interface TrainingPointTransaction {
  id: string
  member_id: string
  member_name: string
  delta: number
  reason: string | null
  source: 'manual' | 'system_spend' | 'adjustment'
  related_session_id: string | null
  related_registration_id: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

export interface TrainingSessionSettingsInput {
  match_id: string
  registration_start_at?: string | null
  registration_end_at?: string | null
  manual_status: TrainingManualStatus
  capacity?: number | null
  point_cost?: number | null
}

export interface TrainingSessionCreateInput {
  match_name: string
  match_date: string
  match_time?: string | null
  location?: string | null
  category_group?: string | null
  registration_start_at?: string | null
  registration_end_at?: string | null
  manual_status: TrainingManualStatus
  capacity?: number | null
  point_cost?: number | null
}
