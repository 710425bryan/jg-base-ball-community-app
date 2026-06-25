export type CoachScheduleSourceType =
  | 'training_date'
  | 'training_location'
  | 'match'
  | 'training_class'
  | 'manual'

export type CoachScheduleStatus = 'scheduled' | 'cancelled'

export type CoachScheduleDashboardScope = 'admin' | 'all' | 'own' | 'none'

export type SchedulableCoach = {
  id: string
  name: string
  nickname: string | null
  role: string
  avatar_url: string | null
}

export type CoachScheduleAssignment = {
  id: string
  event_id: string
  coach_profile_id: string
  coach_name: string
  coach_nickname: string | null
  coach_role: string | null
  coach_avatar_url: string | null
  role_label: string | null
  note: string | null
}

export type CoachScheduleEvent = {
  id: string | null
  is_persisted: boolean
  is_candidate: boolean
  source_type: CoachScheduleSourceType
  source_id: string | null
  source_venue_id: string | null
  schedule_date: string
  start_time: string | null
  end_time: string | null
  title: string
  location: string | null
  location_url: string | null
  legacy_coaches: string | null
  status: CoachScheduleStatus
  note: string | null
  coach_profile_ids: string[]
  assignments: CoachScheduleAssignment[]
  created_at: string | null
  updated_at: string | null
}

export type CoachScheduleMonthPayload = {
  month_start: string
  scope: CoachScheduleDashboardScope
  events: CoachScheduleEvent[]
}

export type CoachScheduleSaveInput = {
  id?: string | null
  source_type: CoachScheduleSourceType
  source_id?: string | null
  source_venue_id?: string | null
  schedule_date: string
  start_time?: string | null
  end_time?: string | null
  title: string
  location?: string | null
  location_url?: string | null
  legacy_coaches?: string | null
  status?: CoachScheduleStatus
  note?: string | null
  coach_profile_ids: string[]
}
