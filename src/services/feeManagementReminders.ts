import { supabase } from '@/services/supabase'
import dayjs from 'dayjs'
import { listMatchFeeItemsByMonth, listMatchPaymentSubmissions } from '@/services/matchFees'
import type {
  FeeManagementReminderItem,
  FeeManagementReminderSeverity,
  FeeManagementReminderSnapshot
} from '@/types/feeManagementReminders'
import { normalizeFeeManagementReminderSnapshot } from '@/utils/feeManagementReminders'

const severityRank: Record<FeeManagementReminderSeverity, number> = {
  urgent: 1,
  warning: 2,
  info: 3
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(amount) || 0)

const mergeReminderItems = (
  snapshot: FeeManagementReminderSnapshot,
  extraItems: FeeManagementReminderItem[]
): FeeManagementReminderSnapshot => {
  const items = [...snapshot.items, ...extraItems]
    .filter((item) => item.count > 0)
    .sort((left, right) => {
      const severityDiff = severityRank[left.severity] - severityRank[right.severity]
      if (severityDiff !== 0) return severityDiff
      return right.created_at.localeCompare(left.created_at)
    })

  return {
    ...snapshot,
    items,
    total_count: items.reduce((total, item) => total + item.count, 0),
    total_amount: items.reduce((total, item) => total + item.amount, 0)
  }
}

const buildMatchFeeReminderItems = async (): Promise<FeeManagementReminderItem[]> => {
  try {
    const feeMonth = dayjs().format('YYYY-MM')
    const [submissions, feeItems] = await Promise.all([
      listMatchPaymentSubmissions(),
      listMatchFeeItemsByMonth(feeMonth)
    ])

    const pendingSubmissions = submissions.filter((submission) => submission.status === 'pending_review')
    const unpaidItems = feeItems.filter((item) => item.payment_status === 'unpaid')
    const reminders: FeeManagementReminderItem[] = []

    if (pendingSubmissions.length > 0) {
      const totalAmount = pendingSubmissions.reduce((total, submission) => total + Number(submission.amount || 0), 0)
      const latestSubmission = [...pendingSubmissions].sort((left, right) => right.created_at.localeCompare(left.created_at))[0]

      reminders.push({
        id: 'match-payment-pending',
        kind: 'matchPaymentPending',
        title: '比賽費用付款待確認',
        body: `${pendingSubmissions.length} 筆比賽費用付款回報待確認，合計 ${formatCurrency(totalAmount)}。`,
        count: pendingSubmissions.length,
        amount: totalAmount,
        severity: 'urgent',
        link: latestSubmission
          ? `/fees?tab=match-fees&highlight_match_submission_id=${latestSubmission.id}`
          : '/fees?tab=match-fees',
        created_at: latestSubmission?.created_at || new Date(0).toISOString()
      })
    }

    if (unpaidItems.length > 0) {
      const totalAmount = unpaidItems.reduce((total, item) => total + Number(item.amount || 0), 0)
      const latestItem = [...unpaidItems].sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0]

      reminders.push({
        id: 'match-fees-unpaid',
        kind: 'matchFeesUnpaid',
        title: '比賽費用待追蹤',
        body: `${feeMonth} 尚未付款：${unpaidItems.length} 筆，合計 ${formatCurrency(totalAmount)}。`,
        count: unpaidItems.length,
        amount: totalAmount,
        severity: 'info',
        link: '/fees?tab=match-fees',
        created_at: latestItem?.updated_at || new Date(0).toISOString()
      })
    }

    return reminders
  } catch (error) {
    console.warn('比賽費用收費提醒補充資料讀取失敗，暫以原本收費提醒顯示。', error)
    return []
  }
}

export const getFeeManagementReminders = async (): Promise<FeeManagementReminderSnapshot> => {
  const { data, error } = await supabase.rpc('get_fee_management_reminders')

  if (error) {
    throw error
  }

  const snapshot = normalizeFeeManagementReminderSnapshot(data)
  const matchFeeReminderItems = await buildMatchFeeReminderItems()

  return mergeReminderItems(snapshot, matchFeeReminderItems)
}
