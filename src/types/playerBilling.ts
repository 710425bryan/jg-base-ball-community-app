import type { BillingModeMember } from '@/utils/memberBilling'

export interface PlayerMatchBilling extends BillingModeMember {
  match_fee_enabled?: boolean | null
  match_fee_start_date?: string | null
}
