export const MATCH_FEE_PAYMENT_NOTIFICATION_ACTION = 'PAYMENT_REMINDER'
export const MATCH_FEE_PAYMENT_NOTIFICATION_TITLE = '比賽費用已開放付款'
export const MATCH_FEE_PAYMENT_NOTIFICATION_URL = '/my-payments'

export type MatchFeePaymentNotificationMatch = {
  id: string
  match_name?: string | null
  match_date?: string | null
  payment_opened_at: string
}

export type MatchFeePaymentNotificationItem = {
  id: string
  member_id: string
  member_name?: string | null
  amount: number
}

export type MatchFeePaymentNotificationProfile = {
  id: string
  linked_team_member_ids?: string[] | null
}

export type MatchFeePaymentNotificationTarget = {
  user_id: string
  item_ids: string[]
  member_ids: string[]
  member_names: string[]
  total_amount: number
  title: string
  body: string
  url: string
  event_key: string
}

export type MatchFeePaymentNotificationDispatchResult = {
  success?: boolean
  match_id?: string
  member_count?: number
  target_user_count?: number
  subscription_count?: number
  total_amount?: number
  created_count?: number
  duplicate_count?: number
  dispatched_count?: number
  expired_count?: number
  failed_count?: number
  provider_counts?: Record<string, number>
  targets?: MatchFeePaymentNotificationTarget[]
  error?: string
}

export type MatchFeePaymentNotificationFeedback = {
  type: 'success' | 'warning'
  message: string
}

const normalizeText = (value: unknown) => String(value ?? '').trim()

const uniqueTexts = (values: unknown[]) => [...new Set(
  values.map(normalizeText).filter(Boolean)
)]

const normalizeAmount = (value: unknown) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

const normalizeOpenedAt = (value: unknown) => {
  const normalized = normalizeText(value)
  const parsed = new Date(normalized)
  return normalized && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : normalized
}

export const formatMatchFeePaymentNotificationCurrency = (amount: unknown) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(normalizeAmount(amount))

export const buildMatchFeePaymentNotificationEventKey = (input: {
  matchId: string
  paymentOpenedAt: string
  userId: string
}) => [
  'match_fee_payment_opened',
  normalizeText(input.matchId),
  normalizeOpenedAt(input.paymentOpenedAt),
  normalizeText(input.userId)
].join(':')

export const buildMatchFeePaymentNotificationBody = (input: {
  matchName?: string | null
  matchDate?: string | null
  memberNames: string[]
  totalAmount: number
}) => {
  const memberNames = uniqueTexts(input.memberNames)
  const memberLabel = memberNames.length > 0 ? memberNames.join('、') : '相關球員'
  const matchName = normalizeText(input.matchName) || '比賽'
  const matchDate = normalizeText(input.matchDate)
  const matchLabel = matchDate ? `「${matchName}」（${matchDate}）` : `「${matchName}」`

  return `${memberLabel} 的${matchLabel}比賽費用已開放，合計 ${formatMatchFeePaymentNotificationCurrency(input.totalAmount)}。請至繳費資訊查看並完成付款。`
}

export const groupMatchFeePaymentNotificationTargets = (
  match: MatchFeePaymentNotificationMatch,
  items: MatchFeePaymentNotificationItem[],
  profiles: MatchFeePaymentNotificationProfile[]
): MatchFeePaymentNotificationTarget[] => {
  const uniqueItems = new Map<string, MatchFeePaymentNotificationItem>()

  for (const item of items) {
    const itemId = normalizeText(item.id)
    const memberId = normalizeText(item.member_id)
    const amount = normalizeAmount(item.amount)
    if (!itemId || !memberId || amount <= 0) continue

    uniqueItems.set(itemId, {
      id: itemId,
      member_id: memberId,
      member_name: normalizeText(item.member_name) || '未命名球員',
      amount
    })
  }

  return profiles
    .map((profile) => {
      const userId = normalizeText(profile.id)
      const linkedMemberIds = new Set(uniqueTexts(profile.linked_team_member_ids || []))
      if (!userId || linkedMemberIds.size === 0) return null

      const linkedItems = [...uniqueItems.values()]
        .filter((item) => linkedMemberIds.has(item.member_id))
      if (linkedItems.length === 0) return null

      const memberIds = uniqueTexts(linkedItems.map((item) => item.member_id))
      const memberNames = uniqueTexts(linkedItems.map((item) => item.member_name))
      const totalAmount = linkedItems.reduce((total, item) => total + item.amount, 0)

      return {
        user_id: userId,
        item_ids: linkedItems.map((item) => item.id),
        member_ids: memberIds,
        member_names: memberNames,
        total_amount: totalAmount,
        title: MATCH_FEE_PAYMENT_NOTIFICATION_TITLE,
        body: buildMatchFeePaymentNotificationBody({
          matchName: match.match_name,
          matchDate: match.match_date,
          memberNames,
          totalAmount
        }),
        url: MATCH_FEE_PAYMENT_NOTIFICATION_URL,
        event_key: buildMatchFeePaymentNotificationEventKey({
          matchId: match.id,
          paymentOpenedAt: match.payment_opened_at,
          userId
        })
      }
    })
    .filter((target): target is MatchFeePaymentNotificationTarget => Boolean(target))
    .sort((left, right) => left.member_names.join('、').localeCompare(right.member_names.join('、'), 'zh-Hant'))
}

export const describeMatchFeePaymentNotificationResult = (
  result?: MatchFeePaymentNotificationDispatchResult | null
): MatchFeePaymentNotificationFeedback => {
  if (!result) {
    return {
      type: 'warning',
      message: '通知派送結果不明，請稍後確認通知中心。'
    }
  }

  if ((result.target_user_count ?? 0) === 0) {
    return {
      type: 'warning',
      message: '找不到與應繳球員綁定且目前可登入的帳號，因此沒有建立通知。'
    }
  }

  if ((result.created_count ?? 0) === 0 && (result.duplicate_count ?? 0) > 0) {
    return {
      type: 'success',
      message: '這次開放的付款通知已處理過，系統已略過重複發送。'
    }
  }

  if ((result.subscription_count ?? 0) === 0) {
    return {
      type: 'warning',
      message: '已建立站內通知，但相關帳號尚未開啟瀏覽器通知。'
    }
  }

  if ((result.dispatched_count ?? 0) > 0 && (result.failed_count ?? 0) === 0) {
    return {
      type: 'success',
      message: '已發送站內通知與瀏覽器通知。'
    }
  }

  if ((result.dispatched_count ?? 0) > 0) {
    return {
      type: 'warning',
      message: '已建立站內通知，部分瀏覽器通知已送達，仍有裝置暫時派送失敗。'
    }
  }

  return {
    type: 'warning',
    message: '已建立站內通知，但瀏覽器通知這次沒有成功送達。'
  }
}
