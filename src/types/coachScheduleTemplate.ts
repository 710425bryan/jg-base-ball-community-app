import type { CoachScheduleEvent } from './coachSchedule'

export type CoachScheduleTemplateInput = {
  id: string | null
  name: string
  is_active: boolean
  match_mode: 'venue'
  venue_id: string | null
  venue_name: string
  coach_profile_ids: string[]
  updated_at: string | null
}

export type CoachScheduleTemplate = CoachScheduleTemplateInput & {
  id: string
  venue_id: string
  venue_is_active: boolean
}

export type CoachScheduleTemplateVenue = { id: string; name: string }

export type CoachScheduleAutoFillRow = {
  event_key: string
  event: CoachScheduleEvent
  template_id: string
  template_name: string
  proposed_coach_profile_ids: string[]
  excluded_coaches: Array<{ id: string; name: string; reason: string }>
  vacancy_count: number
  time_incomplete: boolean
}

export type CoachScheduleAutoFillPreview = {
  fingerprint: string
  rows: CoachScheduleAutoFillRow[]
}
