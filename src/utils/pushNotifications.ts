import { supabase } from '@/services/supabase'

export type PushNotificationDispatchOptions = {
  title: string
  body: string
  url: string
  feature: string
  action?: string
  targetRoles?: string[]
  eventKey?: string
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
  eventKey
}: PushNotificationDispatchOptions) => {
  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: {
      title,
      body,
      url,
      feature,
      action,
      target_roles: targetRoles,
      event_key: eventKey
    }
  })

  if (error) {
    throw error
  }

  return data
}
