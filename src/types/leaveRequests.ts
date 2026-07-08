export type LeaveType = '事假' | '病假' | '公假' | '其他'

export type LeaveMode = '上課日期快選' | '單日請假' | '連續多日' | '固定週期'

export type LeaveTimeSegment = 'full_day' | 'morning' | 'afternoon'

export type LeaveDateRange = [string, string]

export type LeaveRequestFormState = {
  leave_type: LeaveType
  leave_mode: LeaveMode
  leave_time_segment: LeaveTimeSegment
  selected_training_dates: string[]
  date_single: string
  date_range: LeaveDateRange
  recurring_days: number[]
  recurring_range: LeaveDateRange
  reason: string
}

export type LeaveRequestDraftRecord = {
  member_id: string
  leave_type: LeaveType
  leave_time_segment: LeaveTimeSegment
  start_date: string
  end_date: string
  reason: string | null
}

export type MyLeaveMember = {
  member_id: string
  name: string
  role: string
  team_group?: string | null
  fee_billing_mode?: string | null
  training_program?: string | null
  training_program_label?: string | null
  is_linked?: boolean
}

export type MyLeaveRequest = {
  id: string
  member_id: string
  member_name: string
  member_role: string | null
  leave_type: string
  leave_time_segment: LeaveTimeSegment | string | null
  start_date: string
  end_date: string
  reason: string | null
  created_at: string
}

export type CreateMyLeaveRequestRecordPayload = {
  leave_type: string
  leave_time_segment?: string | null
  start_date: string
  end_date: string
  reason?: string | null
}

export type CreateMyLeaveRequestsPayload = {
  member_id: string
  records: CreateMyLeaveRequestRecordPayload[]
}
