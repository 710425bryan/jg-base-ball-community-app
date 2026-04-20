export type LeaveType = '事假' | '病假' | '公假' | '其他'

export type LeaveMode = '單日請假' | '連續多日' | '固定週期'

export type LeaveDateRange = [string, string]

export type LeaveTimeRange = [string, string] | null

export type LeaveRequestFormState = {
  leave_type: LeaveType
  leave_mode: LeaveMode
  date_single: string
  date_range: LeaveDateRange
  recurring_days: number[]
  recurring_range: LeaveDateRange
  time_range: LeaveTimeRange
  reason: string
}

export type LeaveRequestDraftRecord = {
  member_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  reason: string | null
}

export type MyLeaveMember = {
  member_id: string
  name: string
  role: string
  is_linked?: boolean
}

export type MyLeaveRequest = {
  id: string
  member_id: string
  member_name: string
  member_role: string | null
  leave_type: string
  start_date: string
  end_date: string
  reason: string | null
  created_at: string
}

export type CreateMyLeaveRequestRecordPayload = {
  leave_type: string
  start_date: string
  end_date: string
  reason?: string | null
}

export type CreateMyLeaveRequestsPayload = {
  member_id: string
  records: CreateMyLeaveRequestRecordPayload[]
}
