import type { CoachLeaveTimeSegment } from '@/types/coachLeaveRequest'

export type CoachLeaveDateMode = 'quick' | 'single' | 'range' | 'recurring'

export type CoachLeaveDateSelectionState = {
  mode: CoachLeaveDateMode
  selectedDates: string[]
  singleDate: string
  rangeStart: string
  rangeEnd: string
  recurringDays: number[]
  recurringStart: string
  recurringEnd: string
}

export type CoachLeaveDateRecord = {
  start_date: string
  end_date: string
  time_segment: CoachLeaveTimeSegment
}

export type CoachLeaveBatchCreateInput = {
  coach_profile_id?: string | null
  records: CoachLeaveDateRecord[]
  reason?: string | null
}

export type CoachLeaveTrainingDates = {
  month_start: string
  programs: {
    program_key: string
    program_label: string
    training_dates: string[]
  }[]
}

export type CoachLeaveClassDateLoader = (month: string) => Promise<CoachLeaveTrainingDates>
