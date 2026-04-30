export type PaymentBillingMode = 'monthly' | 'quarterly'
export type PaymentCalculationType = 'per_session' | 'monthly_fixed'

export type PaymentRecordStatus =
  | 'paid'
  | 'unpaid'
  | 'pending_review'
  | 'approved'
  | 'rejected'

export type MyPaymentMember = {
  member_id: string
  name: string
  role: '校隊' | '球員'
  billing_mode: PaymentBillingMode
  is_linked?: boolean
  balance_amount?: number
}

export type MyPaymentRecord = {
  member_id: string
  member_name: string
  billing_mode: PaymentBillingMode
  period_key: string
  period_label: string
  amount: number
  balance_amount: number
  external_amount: number
  status: PaymentRecordStatus | string
  payment_method: string | null
  account_last_5: string | null
  remittance_date: string | null
  updated_at: string | null
}

export type MyPaymentSubmissionStatus = 'pending_review' | 'approved' | 'rejected'

export type MyPaymentSubmission = {
  id: string
  member_id: string
  member_name: string
  billing_mode: PaymentBillingMode
  period_key: string
  period_label: string
  amount: number
  balance_amount: number
  external_amount: number
  payment_method: string
  account_last_5: string | null
  remittance_date: string
  note: string | null
  status: MyPaymentSubmissionStatus
  created_at: string
  updated_at: string
}

export type CreateMyPaymentSubmissionPayload = {
  member_id: string
  period_key: string
  amount: number
  balance_amount?: number
  payment_method: string
  account_last_5?: string | null
  remittance_date: string
  note?: string | null
}

export type MyPaymentSubmissionEstimate = {
  member_id: string
  member_name: string
  billing_mode: PaymentBillingMode
  period_key: string
  period_label: string
  amount: number
  total_sessions: number | null
  leave_sessions: number | null
  per_session_fee: number | null
  deduction_amount: number | null
  calculation_type?: PaymentCalculationType | null
  fixed_monthly_fee?: number | null
}
