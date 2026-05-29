import { supabase } from '@/services/supabase'
import type {
  QuarterlyFeeCompensationDefaults,
  QuarterlyFeeCompensationItem
} from '@/types/quarterlyFeeCompensation'
import {
  DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT,
  DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT,
  normalizeQuarterlyFeeCompensationDefaults
} from '@/utils/quarterlyFeeCompensation'
import { getTrainingMonthStartDate } from '@/utils/trainingMonthDates'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) return [] as T[]
  return Array.isArray(data) ? data : [data]
}

const normalizeNumber = (value: unknown) => Number(value) || 0

const normalizeDefaults = (row: any): QuarterlyFeeCompensationDefaults =>
  normalizeQuarterlyFeeCompensationDefaults({
    regularDailyCredit: row?.regular_daily_credit ?? DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT,
    discountDailyCredit: row?.discount_daily_credit ?? DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT
  })

const normalizeCompensationItem = (row: any): QuarterlyFeeCompensationItem => ({
  id: String(row?.id || ''),
  period_key: String(row?.period_key || ''),
  month_start: String(row?.month_start || ''),
  month: String(row?.month || row?.month_start || '').slice(0, 7),
  member_id: String(row?.member_id || ''),
  member_name: String(row?.member_name || ''),
  status: String(row?.status || 'pending'),
  baseline_session_count: normalizeNumber(row?.baseline_session_count),
  configured_session_count: normalizeNumber(row?.configured_session_count),
  compensation_days: normalizeNumber(row?.compensation_days),
  daily_credit_amount: normalizeNumber(row?.daily_credit_amount),
  suggested_amount: normalizeNumber(row?.suggested_amount),
  approved_amount: normalizeNumber(row?.approved_amount),
  note: row?.note ?? null,
  reviewed_by: row?.reviewed_by ?? null,
  reviewed_by_name: row?.reviewed_by_name ?? null,
  reviewed_at: row?.reviewed_at ?? null,
  balance_transaction_id: row?.balance_transaction_id ?? null,
  created_at: String(row?.created_at || ''),
  updated_at: String(row?.updated_at || '')
})

export const getQuarterlyFeeCompensationDefaults = async () => {
  const { data, error } = await supabase.rpc('get_quarterly_fee_compensation_defaults')
  if (error) throw error
  return normalizeDefaults(data)
}

export const saveQuarterlyFeeCompensationDefaults = async (
  defaults: QuarterlyFeeCompensationDefaults
) => {
  const normalized = normalizeQuarterlyFeeCompensationDefaults(defaults)
  const { data, error } = await supabase.rpc('save_quarterly_fee_compensation_defaults', {
    p_regular_daily_credit: normalized.regularDailyCredit,
    p_discount_daily_credit: normalized.discountDailyCredit
  })
  if (error) throw error
  return normalizeDefaults(data)
}

export const listQuarterlyFeeCompensationItems = async (input: {
  periodKey: string
  month: string
}) => {
  const { data, error } = await supabase.rpc('list_quarterly_fee_compensation_items', {
    p_period_key: input.periodKey,
    p_month: getTrainingMonthStartDate(input.month)
  })
  if (error) throw error
  return unwrapRows<any>(data).map(normalizeCompensationItem)
}

export const generateQuarterlyFeeCompensationDrafts = async (input: {
  periodKey: string
  month: string
}) => {
  const { data, error } = await supabase.rpc('upsert_quarterly_fee_compensation_drafts', {
    p_period_key: input.periodKey,
    p_month: getTrainingMonthStartDate(input.month)
  })
  if (error) throw error
  return unwrapRows<any>(data).map(normalizeCompensationItem)
}

export const approveQuarterlyFeeCompensationItem = async (input: {
  itemId: string
  approvedAmount: number
  note?: string | null
}) => {
  const { data, error } = await supabase.rpc('approve_quarterly_fee_compensation_item', {
    p_item_id: input.itemId,
    p_approved_amount: Math.max(0, Math.trunc(Number(input.approvedAmount) || 0)),
    p_note: input.note || null
  })
  if (error) throw error
  return normalizeCompensationItem(unwrapRows<any>(data)[0] || null)
}

export const skipQuarterlyFeeCompensationItem = async (input: {
  itemId: string
  note?: string | null
}) => {
  const { data, error } = await supabase.rpc('skip_quarterly_fee_compensation_item', {
    p_item_id: input.itemId,
    p_note: input.note || null
  })
  if (error) throw error
  return normalizeCompensationItem(unwrapRows<any>(data)[0] || null)
}
