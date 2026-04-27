import { supabase } from '@/services/supabase'

export type PushNotificationDispatchOptions = {
  title: string
  body: string
  url: string
  feature: string
  action?: string
  targetRoles?: string[]
  targetUserIds?: string[]
  eventKey?: string
}

export type PushNotificationDispatchResult = {
  success?: boolean
  skipped?: boolean
  reason?: string
  total_targets?: number
  dispatched_count?: number
  expired_count?: number
  failed_count?: number
  provider_counts?: Record<string, number>
}

export const buildPushEventKey = (scope: string, id: string | number) => `${scope}:${String(id)}`

export const buildGroupedPushEventKey = (
  scope: string,
  ids: Array<string | number | null | undefined>
) => {
  const normalizedIds = [...new Set(
    ids
      .filter((id): id is string | number => id !== null && id !== undefined && String(id).trim().length > 0)
      .map((id) => String(id).trim())
  )].sort((left, right) => left.localeCompare(right))

  return `${scope}:${normalizedIds.join(',')}`
}

export const dispatchPushNotification = async ({
  title,
  body,
  url,
  feature,
  action = 'VIEW',
  targetRoles,
  targetUserIds,
  eventKey
}: PushNotificationDispatchOptions) => {
  const { data, error } = await supabase.functions.invoke<PushNotificationDispatchResult>('send-push-notification', {
    body: {
      title,
      body,
      url,
      feature,
      action,
      target_roles: targetRoles,
      target_user_ids: targetUserIds,
      event_key: eventKey
    }
  })

  if (error) {
    throw error
  }

  return data
}

export const describePushDispatchIssue = (
  result?: PushNotificationDispatchResult | null
) => {
  if (!result) {
    return '通知派送結果不明，請稍後再確認接收裝置。'
  }

  if (result.skipped && result.reason === 'duplicate_event') {
    return '這筆通知事件已處理過，系統略過了重複推播。'
  }

  if ((result.total_targets ?? 0) === 0) {
    return '目前沒有已啟用推播的接收裝置，請確認接收人已在「個人設定」開啟系統推播通知。'
  }

  if ((result.dispatched_count ?? 0) === 0 && ((result.failed_count ?? 0) > 0 || (result.expired_count ?? 0) > 0)) {
    return '相關裝置這次沒有成功收到推播，可能是訂閱失效或裝置暫時不可用。'
  }

  return null
}
