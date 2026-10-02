import { clampBatchLimit, getDeliveryFailureDisposition, mapWithConcurrency } from '../process-team-member-notification-outbox/logic.ts'

export type CoachLeaveDelivery = {
  id: string
  event_id: string
  subscription_id: string
  user_id: string
  endpoint: string
  subscription: Record<string, unknown>
  attempt_count: number
  title: string
  body: string
  url: string
}
type Database = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }>
  from: (table: string) => any
}
type Send = (delivery: CoachLeaveDelivery) => Promise<'sent' | 'expired'>

export const normalizeCoachLeavePushSubscription = (value: Record<string, unknown>) => {
  const keys = value.keys && typeof value.keys === 'object' ? value.keys as Record<string, unknown> : {}
  if (typeof value.endpoint !== 'string' || !value.endpoint
    || typeof keys.p256dh !== 'string' || !keys.p256dh || typeof keys.auth !== 'string' || !keys.auth) {
    throw new Error('Invalid web push subscription')
  }
  return { endpoint: value.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}

export const sendCoachLeavePush = async (
  delivery: CoachLeaveDelivery,
  sendNotification: (subscription: Record<string, unknown>, payload: string) => Promise<unknown>,
  removeSubscription: (subscriptionId: string, userId: string) => Promise<void>
): Promise<'sent' | 'expired'> => {
  try {
    await sendNotification(delivery.subscription, JSON.stringify({ title: delivery.title, body: delivery.body, url: delivery.url }))
    return 'sent'
  } catch (error: any) {
    if (error?.statusCode !== 404 && error?.statusCode !== 410) throw error
    await removeSubscription(delivery.subscription_id, delivery.user_id)
    return 'expired'
  }
}

export const isAuthorizedCoachLeaveWorker = (provided: string, secret: string) => {
  if (!secret || provided.length !== secret.length) return false
  let mismatch = 0
  for (let i = 0; i < secret.length; i++) mismatch |= provided.charCodeAt(i) ^ secret.charCodeAt(i)
  return mismatch === 0
}

export const createCoachLeaveWorkerHandler = (options: {
  secret: string
  vapidConfigured: boolean
  process: (input: { event_limit?: unknown; delivery_limit?: unknown }) => Promise<Record<string, unknown>>
  onError?: () => void
}) => async (req: Request) => {
  const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' }
  })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!options.secret) return json({ error: 'worker is not configured' }, 500)
  if (!isAuthorizedCoachLeaveWorker(req.headers.get('x-sync-secret') || '', options.secret)) {
    return json({ error: 'unauthorized' }, 401)
  }
  if (!options.vapidConfigured) return json({ error: 'VAPID keys are not configured' }, 500)
  try {
    const body = await req.json().catch(() => ({}))
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
    return json(await options.process(input))
  } catch {
    options.onError?.()
    return json({ error: 'outbox worker failed' }, 500)
  }
}

export const processCoachLeaveOutbox = async (
  db: Database, send: Send, options: { event_limit?: unknown; delivery_limit?: unknown } = {}
) => {
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args)
    if (error) throw error
    return data
  }
  const events = await rpc('claim_coach_leave_notification_outbox_events', {
    p_limit: clampBatchLimit(options.event_limit, 25, 25)
  }) || []
  let initializedTargets = 0
  let initializationFailures = 0
  for (const event of events) {
    try {
      initializedTargets += Number(await rpc('initialize_coach_leave_notification_deliveries', { p_event_id: event.id }))
    } catch {
      initializationFailures++
      await rpc('release_coach_leave_notification_outbox_event', {
        p_event_id: event.id, p_error: 'Failed to initialize coach leave delivery targets'
      })
    }
  }
  const deliveries: CoachLeaveDelivery[] = await rpc('claim_coach_leave_notification_deliveries', {
    p_limit: clampBatchLimit(options.delivery_limit, 100, 100)
  }) || []
  const update = async (delivery: CoachLeaveDelivery, values: Record<string, unknown>) => {
    const { error } = await db.from('push_dispatch_deliveries').update({
      ...values, locked_at: null, updated_at: new Date().toISOString()
    }).eq('id', delivery.id).eq('status', 'processing').eq('attempt_count', delivery.attempt_count)
    if (error) throw error
  }
  const results = await mapWithConcurrency(deliveries, 10, async delivery => {
    try {
      const current: CoachLeaveDelivery[] = await rpc('get_coach_leave_notification_delivery', {
        p_delivery_id: delivery.id, p_attempt_count: delivery.attempt_count
      }) || []
      if (!current[0]) {
        await update(delivery, { status: 'failed', last_error: 'Recipient permission or subscription is no longer valid' })
        return 'ineligible'
      }
      const status = await send(current[0])
      await update(delivery, {
        status, sent_at: status === 'sent' ? new Date().toISOString() : null,
        last_error: status === 'expired' ? 'Web push subscription expired' : null
      })
      return status
    } catch {
      const disposition = getDeliveryFailureDisposition(delivery.attempt_count)
      await update(delivery, {
        status: disposition.status, next_attempt_at: disposition.nextAttemptAt,
        last_error: 'Coach leave push delivery failed'
      })
      return disposition.status === 'failed' ? 'failed' : 'retrying'
    }
  })
  for (const eventId of new Set(deliveries.map(row => row.event_id))) {
    await rpc('finalize_coach_leave_notification_outbox_event', { p_event_id: eventId })
  }
  return {
    success: true, claimed_events: events.length, initialized_targets: initializedTargets,
    event_initialization_failures: initializationFailures, claimed_deliveries: deliveries.length,
    delivery_results: results.reduce<Record<string, number>>((counts, status) => {
      counts[status] = (counts[status] || 0) + 1
      return counts
    }, {})
  }
}
