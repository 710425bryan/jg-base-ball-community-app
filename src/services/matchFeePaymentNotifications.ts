import { supabase } from '@/services/supabase'
import type {
  MatchFeePaymentNotificationDispatchResult,
  MatchFeePaymentNotificationTarget
} from '@/utils/matchFeePaymentNotifications'

export class MatchFeePaymentNotificationAuthError extends Error {
  code = 'AUTH_REQUIRED'

  constructor() {
    super('登入狀態已過期，請重新登入後再試。')
    this.name = 'MatchFeePaymentNotificationAuthError'
  }
}

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

const normalizeStringArray = (value: unknown) => Array.isArray(value)
  ? value.map((item) => String(item || '').trim()).filter(Boolean)
  : []

const normalizeTarget = (row: any): MatchFeePaymentNotificationTarget => ({
  user_id: String(row?.user_id || ''),
  item_ids: normalizeStringArray(row?.item_ids),
  member_ids: normalizeStringArray(row?.member_ids),
  member_names: normalizeStringArray(row?.member_names),
  total_amount: normalizeNumber(row?.total_amount),
  title: String(row?.title || '比賽費用已開放付款'),
  body: String(row?.body || ''),
  url: String(row?.url || '/my-payments'),
  event_key: String(row?.event_key || '')
})

const normalizeResult = (
  data: MatchFeePaymentNotificationDispatchResult | null | undefined,
  matchId: string
): MatchFeePaymentNotificationDispatchResult => ({
  success: data?.success !== false,
  match_id: String(data?.match_id || matchId),
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
  targets: Array.isArray(data?.targets) ? data.targets.map(normalizeTarget) : [],
  error: data?.error
})

export const sendMatchFeePaymentOpenedNotifications = async (matchId: string) => {
  const normalizedMatchId = String(matchId || '').trim()
  if (!normalizedMatchId) {
    throw new Error('缺少比賽識別資料，無法發送付款通知。')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const session = sessionData.session
  if (sessionError || !session?.access_token) {
    throw new MatchFeePaymentNotificationAuthError()
  }

  const { data, error } = await supabase.functions.invoke<MatchFeePaymentNotificationDispatchResult>(
    'send-match-fee-payment-notifications',
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      },
      body: {
        match_id: normalizedMatchId
      }
    }
  )

  if (error) throw error
  return normalizeResult(data, normalizedMatchId)
}
