export type MatchFeePaymentStatus = 'unpaid' | 'pending_review' | 'paid' | 'cancelled'

export type MatchPaymentSubmissionStatus = 'pending_review' | 'approved' | 'rejected'

export type MatchFeeItem = {
  id: string
  match_id: string | null
  member_id: string
  member_name: string
  member_role?: string | null
  match_name: string
  tournament_name: string | null
  match_date: string
  match_time: string | null
  category_group: string | null
  fee_month: string
  amount: number
  match_fee_amount?: number | null
  payment_opened_at?: string | null
  payment_opened_by_name?: string | null
  has_payment_history?: boolean
  payment_status: MatchFeePaymentStatus | string
  payment_submission_id: string | null
  payment_submission_status?: MatchPaymentSubmissionStatus | string | null
  payment_method?: string | null
  account_last_5?: string | null
  remittance_date?: string | null
  balance_amount?: number
  paid_at: string | null
  cancelled_reason: string | null
  created_at: string
  updated_at: string
}

export type MatchPaymentSubmission = {
  id: string
  profile_id: string
  member_id: string
  member_name: string
  amount: number
  balance_amount: number
  external_amount: number
  payment_method: string
  account_last_5: string | null
  remittance_date: string
  note: string | null
  status: MatchPaymentSubmissionStatus
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
  items: MatchFeeItem[]
}

export type CreateMatchPaymentSubmissionPayload = {
  match_fee_item_ids: string[]
  payment_method: string
  account_last_5?: string | null
  remittance_date: string
  note?: string | null
  balance_amount?: number
}

export type ReviewMatchPaymentSubmissionStatus = 'approved' | 'rejected'

export type MatchFeePaymentOpenState = {
  match_id: string
  is_payment_open: boolean
  payment_opened_at: string | null
  payable_item_count: number
  payable_amount: number
}
