import { supabase } from '@/services/supabase'
import type {
  CreateMatchPaymentSubmissionPayload,
  MatchFeeItem,
  MatchPaymentSubmission,
  ReviewMatchPaymentSubmissionStatus
} from '@/types/matchFees'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) return [] as T[]
  return Array.isArray(data) ? data : [data]
}

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeMatchFeeItem = (row: any): MatchFeeItem => ({
  ...row,
  amount: normalizeNumber(row?.amount),
  balance_amount: normalizeNumber(row?.balance_amount),
  match_id: row?.match_id ?? null,
  tournament_name: row?.tournament_name ?? null,
  match_time: row?.match_time ?? null,
  category_group: row?.category_group ?? null,
  payment_submission_id: row?.payment_submission_id ?? null,
  payment_submission_status: row?.payment_submission_status ?? null,
  payment_method: row?.payment_method ?? null,
  account_last_5: row?.account_last_5 ?? null,
  remittance_date: row?.remittance_date ?? null,
  paid_at: row?.paid_at ?? null,
  cancelled_reason: row?.cancelled_reason ?? null
})

const normalizeMatchPaymentSubmission = (row: any): MatchPaymentSubmission => ({
  ...row,
  amount: normalizeNumber(row?.amount),
  balance_amount: normalizeNumber(row?.balance_amount),
  external_amount: normalizeNumber(row?.external_amount),
  account_last_5: row?.account_last_5 ?? null,
  note: row?.note ?? null,
  reviewed_at: row?.reviewed_at ?? null,
  reviewed_by: row?.reviewed_by ?? null,
  items: Array.isArray(row?.items)
    ? row.items.map(normalizeMatchFeeItem)
    : []
})

export const listMyMatchFeeItems = async (memberId: string) => {
  const { data, error } = await supabase.rpc('list_my_match_fee_items', {
    p_member_id: memberId
  })

  if (error) throw error
  return unwrapRows<any>(data).map(normalizeMatchFeeItem)
}

export const listMatchFeeItemsByMonth = async (feeMonth: string) => {
  const { data, error } = await supabase.rpc('list_match_fee_items_by_month', {
    p_fee_month: feeMonth
  })

  if (error) throw error
  return unwrapRows<any>(data).map(normalizeMatchFeeItem)
}

export const listMatchPaymentSubmissions = async () => {
  const { data, error } = await supabase.rpc('list_match_payment_submissions')

  if (error) throw error
  return unwrapRows<any>(data).map(normalizeMatchPaymentSubmission)
}

export const createMatchPaymentSubmission = async (
  payload: CreateMatchPaymentSubmissionPayload
) => {
  const { data, error } = await supabase.rpc('create_match_payment_submission', {
    p_match_fee_item_ids: payload.match_fee_item_ids,
    p_payment_method: payload.payment_method,
    p_account_last_5: payload.account_last_5 || null,
    p_remittance_date: payload.remittance_date,
    p_note: payload.note || null,
    p_balance_amount: payload.balance_amount || 0
  })

  if (error) throw error
  return normalizeMatchPaymentSubmission(unwrapRows<any>(data)[0])
}

export const reviewMatchPaymentSubmission = async (
  submissionId: string,
  status: ReviewMatchPaymentSubmissionStatus,
  overpaymentAmount = 0
) => {
  const { data, error } = await supabase.rpc('review_match_payment_submission', {
    p_submission_id: submissionId,
    p_status: status,
    p_overpayment_amount: overpaymentAmount
  })

  if (error) throw error
  return normalizeMatchPaymentSubmission(unwrapRows<any>(data)[0])
}

export const rollbackMatchPaymentSubmission = async (submissionId: string) => {
  const { data, error } = await supabase.rpc('rollback_match_payment_submission', {
    p_submission_id: submissionId
  })

  if (error) throw error
  return normalizeMatchPaymentSubmission(unwrapRows<any>(data)[0])
}
