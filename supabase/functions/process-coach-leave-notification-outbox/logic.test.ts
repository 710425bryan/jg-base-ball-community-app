import { describe, expect, it, vi } from 'vitest'
import { createCoachLeaveWorkerHandler, isAuthorizedCoachLeaveWorker, normalizeCoachLeavePushSubscription, processCoachLeaveOutbox, sendCoachLeavePush, type CoachLeaveDelivery } from './logic'

const delivery: CoachLeaveDelivery = {
  id: 'delivery-1', event_id: 'event-1', subscription_id: 'subscription-1', user_id: 'coach-1',
  endpoint: 'https://push.example/one', subscription: {}, attempt_count: 1,
  title: '教練已取消請假', body: '可重新安排排班', url: '/coach-leave-requests'
}
const database = (overrides: Record<string, any> = {}) => {
  const updates: Record<string, any>[] = []
  const rpc = vi.fn(async (name: string): Promise<{ data: any; error: any }> => ({ data: ({
    claim_coach_leave_notification_outbox_events: [{ id: 'event-1' }],
    initialize_coach_leave_notification_deliveries: 1,
    claim_coach_leave_notification_deliveries: [delivery],
    get_coach_leave_notification_delivery: [{ ...delivery, url: '/coach-schedules?month=2026-10' }],
    ...overrides
  } as any)[name], error: null }))
  return { rpc, updates, from: vi.fn(() => ({ update(values: Record<string, any>) {
    updates.push(values)
    let count = 0
    const query = { eq: vi.fn(() => ++count === 3 ? Promise.resolve({ error: null }) : query) }
    return query
  } })) }
}
describe('coach leave Outbox worker', () => {
  it('validates the database subscription before calling the web push adapter', () => {
    expect(normalizeCoachLeavePushSubscription({ endpoint: 'https://push.example', keys: { p256dh: 'fixture-public', auth: 'fixture-auth' } })).toEqual({ endpoint: 'https://push.example', keys: { p256dh: 'fixture-public', auth: 'fixture-auth' } })
    expect(() => normalizeCoachLeavePushSubscription({ endpoint: 'https://push.example' })).toThrow('Invalid web push subscription')
  })
  it('rejects invalid method, secret and missing VAPID configuration without processing', async () => {
    const process = vi.fn()
    const handler = createCoachLeaveWorkerHandler({ secret: 'fixture-secret', vapidConfigured: true, process })
    expect((await handler(new Request('https://worker.example'))).status).toBe(405)
    expect((await handler(new Request('https://worker.example', { method: 'POST' }))).status).toBe(401)
    const configured = createCoachLeaveWorkerHandler({ secret: 'fixture-secret', vapidConfigured: false, process })
    expect((await configured(new Request('https://worker.example', { method: 'POST', headers: { 'x-sync-secret': 'fixture-secret' } }))).status).toBe(500)
    expect(process).not.toHaveBeenCalled()
  })
  it('accepts cron empty bodies and returns generic errors without leaking credentials', async () => {
    const process = vi.fn().mockResolvedValue({ success: true })
    const handler = createCoachLeaveWorkerHandler({ secret: 'fixture-secret', vapidConfigured: true, process })
    const request = (body: string) => new Request('https://worker.example', { method: 'POST', headers: { 'x-sync-secret': 'fixture-secret' }, body })
    expect(await (await handler(request('null'))).json()).toEqual({ success: true })
    expect(process).toHaveBeenCalledWith({})
    process.mockRejectedValue(new Error('private credential fixture'))
    const response = await handler(request('{}'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'outbox worker failed' })
  })
  it('requires the configured worker secret', () => {
    expect(isAuthorizedCoachLeaveWorker('', '')).toBe(false)
    expect(isAuthorizedCoachLeaveWorker('test', 'test')).toBe(true)
    expect(isAuthorizedCoachLeaveWorker('fail', 'test')).toBe(false)
  })
  it('sends the currently authorized URL and finalizes each event once', async () => {
    const db = database()
    const send = vi.fn().mockResolvedValue('sent')
    const result = await processCoachLeaveOutbox(db, send, { event_limit: 900, delivery_limit: 900 })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ url: '/coach-schedules?month=2026-10' }))
    expect(db.rpc).toHaveBeenCalledWith('claim_coach_leave_notification_outbox_events', { p_limit: 25 })
    expect(db.updates[0]).toMatchObject({ status: 'sent', locked_at: null })
    expect(result.delivery_results).toEqual({ sent: 1 })
    expect(db.rpc.mock.calls.filter(([name]) => name === 'finalize_coach_leave_notification_outbox_event')).toHaveLength(1)
  })
  it('does not send after permission withdrawal', async () => {
    const db = database({ get_coach_leave_notification_delivery: [] })
    const send = vi.fn()
    const result = await processCoachLeaveOutbox(db, send)
    expect(send).not.toHaveBeenCalled()
    expect(result.delivery_results).toEqual({ ineligible: 1 })
    expect(db.updates[0]).toMatchObject({ status: 'failed' })
  })
  it('retries transient failures but stops after the sixth attempt', async () => {
    const send = vi.fn().mockRejectedValue(new Error('provider unavailable'))
    const db = database()
    expect((await processCoachLeaveOutbox(db, send)).delivery_results).toEqual({ retrying: 1 })
    expect(db.updates[0]).toMatchObject({ status: 'pending' })
    const last = { ...delivery, attempt_count: 6 }
    const finalDb = database({ claim_coach_leave_notification_deliveries: [last], get_coach_leave_notification_delivery: [last] })
    expect((await processCoachLeaveOutbox(finalDb, send)).delivery_results).toEqual({ failed: 1 })
  })
  it('finishes events without subscriptions without sending browser notifications', async () => {
    const db = database({ initialize_coach_leave_notification_deliveries: 0, claim_coach_leave_notification_deliveries: [] })
    const send = vi.fn()
    expect((await processCoachLeaveOutbox(db, send)).initialized_targets).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
  it('releases a failed initialization so it can be retried', async () => {
    const db = database({ claim_coach_leave_notification_deliveries: [] })
    const original = db.rpc.getMockImplementation()!
    db.rpc.mockImplementation(async (name: string) => name === 'initialize_coach_leave_notification_deliveries'
      ? { data: null, error: new Error('transaction failed') } : original(name))
    const result = await processCoachLeaveOutbox(db, vi.fn())
    expect(result.event_initialization_failures).toBe(1)
    expect(db.rpc).toHaveBeenCalledWith('release_coach_leave_notification_outbox_event', expect.objectContaining({ p_event_id: 'event-1' }))
  })
  it.each([404, 410])('removes only the expired owned subscription for HTTP %s', async statusCode => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const send = vi.fn().mockRejectedValue({ statusCode })
    expect(await sendCoachLeavePush(delivery, send, remove)).toBe('expired')
    expect(remove).toHaveBeenCalledWith('subscription-1', 'coach-1')
  })
  it('retains subscriptions after a transient provider failure', async () => {
    const remove = vi.fn()
    await expect(sendCoachLeavePush(delivery, vi.fn().mockRejectedValue({ statusCode: 503 }), remove)).rejects.toEqual({ statusCode: 503 })
    expect(remove).not.toHaveBeenCalled()
  })
})
