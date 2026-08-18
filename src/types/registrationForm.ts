export type RegistrationFormFileType = 'xlsx' | 'docx'
export type RegistrationFormProfileKey = 'just_baseball_taipei' | 'chairperson_cup_u9'
export type RegistrationPosition = 'P' | 'C' | 'IF' | 'OF' | ''

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

export interface RegistrationGeneratePayload {
  template_id: string
  fields: RegistrationStaffFields
  players: Array<{
    member_id: string
    overrides: RegistrationPlayerOverrides
  }>
}

export interface RegistrationValidationResult {
  blocking: string[]
  warnings: string[]
}
