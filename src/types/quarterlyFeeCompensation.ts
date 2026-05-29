export type QuarterlyFeeCompensationDefaults = {
  regularDailyCredit: number
  discountDailyCredit: number
}

export type QuarterlyFeeCompensationStatus = 'pending' | 'approved' | 'skipped' | string

export type QuarterlyFeeCompensationItem = {
  id: string
  period_key: string
  month_start: string
  month: string
  member_id: string
  member_name: string
  status: QuarterlyFeeCompensationStatus
  baseline_session_count: number
  configured_session_count: number
  compensation_days: number
  daily_credit_amount: number
  suggested_amount: number
  approved_amount: number
  note: string | null
  reviewed_by: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  balance_transaction_id: string | null
  created_at: string
  updated_at: string
}
