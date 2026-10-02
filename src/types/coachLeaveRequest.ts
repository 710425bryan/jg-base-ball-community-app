import type { SchedulableCoach } from '@/types/coachSchedule'
export type { CoachLeaveBatchCreateInput, CoachLeaveTrainingDates } from '@/types/coachLeaveDateSelection'

export type CoachLeaveTimeSegment = 'full_day' | 'morning' | 'afternoon'
export type CoachLeaveStatus = 'active' | 'cancelled'
export type CoachLeaveStatusFilter = CoachLeaveStatus | 'all'

export type CoachLeaveRequest = {
  id: string
  coach_profile_id: string
  coach_name: string
  coach_nickname: string | null
  start_date: string
  end_date: string
  time_segment: CoachLeaveTimeSegment
  reason: string | null
  status: CoachLeaveStatus
  created_at: string
  updated_at: string
}

export type CoachLeaveList = {
  leaves: CoachLeaveRequest[]
  coaches: SchedulableCoach[]
}

export type CoachLeaveSaveInput = {
  id?: string | null
  updated_at?: string | null
  coach_profile_id?: string | null
  start_date: string
  end_date: string
  time_segment: CoachLeaveTimeSegment
  reason?: string | null
}

export type CoachLeaveListFilters = {
  month?: string | null
  status?: CoachLeaveStatusFilter
  coachProfileId?: string | null
  manage?: boolean
}
