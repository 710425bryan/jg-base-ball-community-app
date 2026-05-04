export type TrainingLocationSessionStatus = 'draft' | 'published' | 'archived'

export type TrainingVenue = {
  id: string
  name: string
  address: string | null
  maps_url: string | null
  sort_order: number
  is_active: boolean
}

export type TrainingLocationRosterMember = {
  member_id: string
  name: string
  role: string | null
  team_group: string | null
  jersey_number: string | null
  is_on_leave: boolean
}

export type TrainingLocationVenueAssignment = TrainingLocationRosterMember

export type TrainingLocationSessionVenue = {
  id: string | null
  venue_id: string | null
  venue_name: string
  venue_address: string | null
  venue_maps_url: string | null
  sort_order: number
  note: string | null
  member_ids: string[]
  assignments: TrainingLocationVenueAssignment[]
}

export type TrainingLocationSession = {
  session_id: string
  title: string
  training_date: string
  start_time: string | null
  end_time: string | null
  status: TrainingLocationSessionStatus
  note: string | null
  created_at: string | null
  updated_at: string | null
  venue_count: number
  assignment_count: number
  venues: TrainingLocationSessionVenue[]
}

export type TrainingLocationSessionSaveVenue = {
  venue_id?: string | null
  venue_name: string
  venue_address?: string | null
  venue_maps_url?: string | null
  sort_order?: number | null
  note?: string | null
  member_ids: string[]
}

export type TrainingLocationSessionSaveInput = {
  session_id?: string | null
  title: string
  training_date: string
  start_time?: string | null
  end_time?: string | null
  status: TrainingLocationSessionStatus
  note?: string | null
  venues: TrainingLocationSessionSaveVenue[]
}

export type TrainingLocationDispatchResult = {
  success?: boolean
  dry_run?: boolean
  target_date?: string
  session_id?: string | null
  target_row_count?: number
  group_count?: number
  active_user_count?: number
  total_targets?: number
  created_count?: number
  duplicate_count?: number
  dispatched_count?: number
  expired_count?: number
  failed_count?: number
  error?: string
}
