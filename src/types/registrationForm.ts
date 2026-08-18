export type RegistrationFormFileType = 'xlsx' | 'docx'
export type RegistrationFormProfileKey = 'just_baseball_taipei' | 'chairperson_cup_u9'
export type RegistrationPosition = 'P' | 'C' | 'IF' | 'OF' | ''
export type RegistrationFormEventStatus = 'draft' | 'in_progress' | 'submitted' | 'closed'

export interface RegistrationFormTemplate {
  id: string
  name: string
  original_file_name: string
  file_type: RegistrationFormFileType
  profile_key: RegistrationFormProfileKey
  profile_version: number
  max_players: number
  has_photo_slots: boolean
  storage_path: string
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface RegistrationFormEvent {
  id: string
  name: string
  season_year: number
  category: string
  organizer: string
  registration_deadline: string | null
  status: RegistrationFormEventStatus
  notes: string
  template_ids: string[]
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface RegistrationFormEventInput {
  id?: string | null
  name: string
  season_year: number
  category: string
  organizer: string
  registration_deadline: string | null
  status: RegistrationFormEventStatus
  notes: string
  template_ids: string[]
}

export interface RegistrationFormGenerationLog {
  id: string
  event_id: string | null
  event_name_snapshot: string | null
  template_id: string | null
  template_name_snapshot: string
  output_file_name: string
  player_count: number
  generated_by: string | null
  created_at: string
}

export interface RegistrationStaffFields {
  team_name: string
  leader_name: string
  leader_phone: string
  head_coach_name: string
  head_coach_phone: string
  coach_1_name: string
  coach_1_phone: string
  coach_2_name: string
  coach_2_phone: string
  manager_name: string
  manager_phone: string
  contact_name: string
  contact_phone: string
}

export interface RegistrationPlayerOverrides {
  jersey_number: string
  birth_date: string
  national_id: string
  throwing_hand: string
  batting_hand: string
  school_name: string
  grade: string
  position: RegistrationPosition
}

export interface RegistrationPlayerRow {
  member_id: string
  name: string
  portrait_auth: boolean
  avatar_url: string
  overrides: RegistrationPlayerOverrides
}

export interface RegistrationWizardPayload {
  template_id: string
  fields: RegistrationStaffFields
  players: Array<{
    member_id: string
    overrides: RegistrationPlayerOverrides
  }>
}

export interface RegistrationGeneratePayload extends RegistrationWizardPayload {
  event_id: string
}

export interface RegistrationValidationResult {
  blocking: string[]
  warnings: string[]
}
