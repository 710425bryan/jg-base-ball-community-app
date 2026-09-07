export type PendingPaymentKind = 'membership' | 'equipment' | 'match'

export type PendingPaymentLine = {
  id: string
  member_id: string
  label: string
  expected_amount: number | null
  balance_amount: number
  reported_external_amount: number
  available_balance: number
}

export type PendingPaymentSubmission = {
  id: string
  kind: PendingPaymentKind
  label: string
  payment_method: string
  account_last_5: string | null
  remittance_date: string
  note: string | null
  amount_mismatch_reason: string | null
  updated_at: string
  items: PendingPaymentLine[]
}

export type PendingPaymentChanges = Pick<PendingPaymentSubmission,
  'payment_method' | 'account_last_5' | 'remittance_date' | 'note' | 'amount_mismatch_reason'
> & {
  items: Pick<PendingPaymentLine, 'id' | 'balance_amount' | 'reported_external_amount'>[]
}
