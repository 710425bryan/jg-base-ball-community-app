import { supabase } from '@/services/supabase'
import type { PlayerBalanceSummary, PlayerBalanceTransaction } from '@/types/playerBalances'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) return [] as T[]
  return Array.isArray(data) ? data : [data]
}

const normalizeNumber = (value: unknown) => Number(value) || 0

const normalizeBalanceSummary = (row: any): PlayerBalanceSummary => ({
  member_id: String(row?.member_id || ''),
  member_name: String(row?.member_name || ''),
  role: String(row?.role || ''),
  balance_amount: normalizeNumber(row?.balance_amount),
  is_linked: Boolean(row?.is_linked)
})

const normalizeBalanceTransaction = (row: any): PlayerBalanceTransaction => ({
  id: String(row?.id || ''),
  member_id: String(row?.member_id || ''),
  member_name: String(row?.member_name || ''),
  delta: normalizeNumber(row?.delta),
  balance_after: normalizeNumber(row?.balance_after),
  reason: row?.reason ?? null,
  source: row?.source || 'manual_adjustment',
  related_profile_payment_submission_id: row?.related_profile_payment_submission_id ?? null,
  related_equipment_payment_submission_id: row?.related_equipment_payment_submission_id ?? null,
  related_match_payment_submission_id: row?.related_match_payment_submission_id ?? null,
  created_by: row?.created_by ?? null,
  created_by_name: row?.created_by_name ?? null,
  created_at: String(row?.created_at || '')
})

export const listPlayerBalances = async () => {
  const { data, error } = await supabase.rpc('list_player_balances')
  if (error) throw error
  return unwrapRows<any>(data).map(normalizeBalanceSummary)
}

export const getPlayerBalance = async (memberId: string) => {
  const { data, error } = await supabase.rpc('get_player_balance', {
    p_member_id: memberId
  })
  if (error) throw error
  return normalizeNumber(data)
}

export const listPlayerBalanceTransactions = async (memberId?: string | null) => {
  const { data, error } = await supabase.rpc('list_player_balance_transactions', {
    p_member_id: memberId || null
  })
  if (error) throw error
  return unwrapRows<any>(data).map(normalizeBalanceTransaction)
}

export const adjustPlayerBalance = async (
  memberId: string,
  delta: number,
  reason?: string | null
) => {
  const { data, error } = await supabase.rpc('adjust_player_balance', {
    p_member_id: memberId,
    p_delta: Math.trunc(Number(delta) || 0),
    p_reason: reason || null
  })
  if (error) throw error
  return unwrapRows<any>(data).map(normalizeBalanceTransaction)
}
