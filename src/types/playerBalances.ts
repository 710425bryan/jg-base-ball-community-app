export type PlayerBalanceSummary = {
  member_id: string
  member_name: string
  role: '校隊' | '球員' | string
  balance_amount: number
  is_linked: boolean
}

export type PlayerBalanceTransactionSource =
  | 'manual_adjustment'
  | 'payment_deduction'
  | 'overpayment'
  | string

export type PlayerBalanceTransaction = {
  id: string
  member_id: string
  member_name: string
  delta: number
  balance_after: number
  reason: string | null
  source: PlayerBalanceTransactionSource
  related_profile_payment_submission_id: string | null
  related_equipment_payment_submission_id: string | null
  related_match_payment_submission_id?: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
}
