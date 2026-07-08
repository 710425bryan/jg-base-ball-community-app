import { supabase } from '@/services/supabase'
import type {
  FeePaymentReminderCategory,
  FeePaymentReminderDispatchPayload,
  FeePaymentReminderDispatchRequest,
  FeePaymentReminderDispatchResult,
  FeePaymentReminderMode,
  FeePaymentReminderTargetGroup,
  FeePaymentReminderTargetItem
} from '@/types/feePaymentReminders'
import {
  FEE_PAYMENT_REMINDER_CATEGORIES,
  getDefaultFeePaymentReminderPeriods,
  normalizeFeePaymentReminderCategories,
  normalizeMonthlyReminderPeriod,
  normalizeQuarterlyReminderPeriod
} from '@/utils/feePaymentReminders'

export class FeePaymentReminderAuthError extends Error {
  code = 'AUTH_REQUIRED'

  constructor() {
    super('登入狀態已過期，請重新登入後再試。')
    this.name = 'FeePaymentReminderAuthError'
  }
}

const ensureAuthenticatedSession = async () => {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new FeePaymentReminderAuthError()
  }

  return data.session
}

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []

const normalizeTargetItem = (row: any): FeePaymentReminderTargetItem => ({
  fee_id: String(row?.fee_id || ''),
  billing_type: row?.billing_type === 'quarterly' ? 'quarterly' : 'monthly',
  period_key: String(row?.period_key || ''),
  period_label: String(row?.period_label || row?.period_key || ''),
  category: normalizeFeePaymentReminderCategories([row?.category], ['community'])[0],
  member_ids: normalizeStringArray(row?.member_ids),
  member_names: normalizeStringArray(row?.member_names),
  amount: normalizeNumber(row?.amount)
})

const normalizeTargetGroup = (row: any): FeePaymentReminderTargetGroup => ({
  user_id: String(row?.user_id || ''),
  items: Array.isArray(row?.items) ? row.items.map(normalizeTargetItem) : [],
  member_ids: normalizeStringArray(row?.member_ids),
  member_names: normalizeStringArray(row?.member_names),
  total_amount: normalizeNumber(row?.total_amount),
  title: String(row?.title || '繳費提醒'),
  body: String(row?.body || ''),
  url: String(row?.url || '/my-payments'),
  event_key: row?.event_key ? String(row.event_key) : undefined
})

const normalizeResult = (
  data: FeePaymentReminderDispatchResult | null | undefined,
  fallbackMode: FeePaymentReminderMode,
  fallbackRequest: FeePaymentReminderDispatchRequest
): FeePaymentReminderDispatchResult => ({
  success: data?.success !== false,
  mode: data?.mode || fallbackMode,
  dry_run: Boolean(data?.dry_run),
  monthly_period: data?.monthly_period || fallbackRequest.monthly_period,
  quarterly_period: data?.quarterly_period || fallbackRequest.quarterly_period,
  categories: normalizeFeePaymentReminderCategories(data?.categories, fallbackRequest.categories),
  member_count: normalizeNumber(data?.member_count),
  target_user_count: normalizeNumber(data?.target_user_count),
  subscription_count: normalizeNumber(data?.subscription_count),
  total_amount: normalizeNumber(data?.total_amount),
  created_count: normalizeNumber(data?.created_count),
  duplicate_count: normalizeNumber(data?.duplicate_count),
  dispatched_count: normalizeNumber(data?.dispatched_count),
  expired_count: normalizeNumber(data?.expired_count),
  failed_count: normalizeNumber(data?.failed_count),
  provider_counts: data?.provider_counts && typeof data.provider_counts === 'object'
    ? data.provider_counts
    : {},
  targets: Array.isArray(data?.targets) ? data.targets.map(normalizeTargetGroup) : [],
  error: data?.error
})

export const normalizeFeePaymentReminderRequest = (
  request: Partial<FeePaymentReminderDispatchRequest> = {}
): FeePaymentReminderDispatchRequest => {
  const defaultPeriods = getDefaultFeePaymentReminderPeriods()

  return {
    categories: normalizeFeePaymentReminderCategories(
      request.categories,
      [...FEE_PAYMENT_REMINDER_CATEGORIES]
    ) as FeePaymentReminderCategory[],
    monthly_period: normalizeMonthlyReminderPeriod(request.monthly_period, defaultPeriods.monthly_period),
    quarterly_period: normalizeQuarterlyReminderPeriod(request.quarterly_period, defaultPeriods.quarterly_period)
  }
}

const invokeFeePaymentReminderFunction = async (
  mode: FeePaymentReminderMode,
  request: Partial<FeePaymentReminderDispatchRequest> = {}
) => {
  const session = await ensureAuthenticatedSession()
  const normalizedRequest = normalizeFeePaymentReminderRequest(request)
  const body: FeePaymentReminderDispatchPayload = {
    mode,
    ...normalizedRequest
  }

  const { data, error } = await supabase.functions.invoke<FeePaymentReminderDispatchResult>(
    'send-fee-payment-reminders',
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      },
      body
    }
  )

  if (error) {
    throw error
  }

  return normalizeResult(data, mode, normalizedRequest)
}

export const previewFeePaymentReminders = (
  request: Partial<FeePaymentReminderDispatchRequest>
) => invokeFeePaymentReminderFunction('preview', request)

export const sendFeePaymentReminders = (
  request: Partial<FeePaymentReminderDispatchRequest>
) => invokeFeePaymentReminderFunction('send', request)

export const sendFeePaymentReminderTest = (
  request: Partial<FeePaymentReminderDispatchRequest> = {}
) => invokeFeePaymentReminderFunction('test', request)
