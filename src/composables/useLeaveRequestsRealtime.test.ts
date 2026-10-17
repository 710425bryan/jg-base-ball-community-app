import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/supabase', () => ({ supabase: {} }))

import {
  createLeaveRequestsRealtime,
  LEAVE_REQUESTS_REALTIME_CHANNEL,
  LEAVE_REQUESTS_REALTIME_DEBOUNCE_MS
} from './useLeaveRequestsRealtime'

const createClient = () => {
  const handlers: Array<() => void> = []
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, handler: () => void) => {
      handlers.push(handler)
      return channel
    }),
    subscribe: vi.fn(() => channel)
  }
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok')
  }
  return { client, channel, emit: () => handlers.forEach((handler) => handler()) }
}

describe('leave requests realtime refresh', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('subscribes only to leave_requests changes', () => {
    const { client, channel } = createClient()
    createLeaveRequestsRealtime(vi.fn(), { client: client as any }).start()

    expect(client.channel).toHaveBeenCalledWith(LEAVE_REQUESTS_REALTIME_CHANNEL)
    expect(channel.on).toHaveBeenCalledTimes(1)
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'leave_requests' },
      expect.any(Function)
    )
    expect(channel.subscribe).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of row events into one refresh', () => {
    const { client, emit } = createClient()
    const refresh = vi.fn()
    createLeaveRequestsRealtime(refresh, { client: client as any }).start()

    for (let index = 0; index < 30; index += 1) emit()
    expect(refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(LEAVE_REQUESTS_REALTIME_DEBOUNCE_MS - 1)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(refresh).toHaveBeenCalledTimes(1)

    emit()
    vi.advanceTimersByTime(LEAVE_REQUESTS_REALTIME_DEBOUNCE_MS)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('restarts the wait while events keep arriving', () => {
    const { client, emit } = createClient()
    const refresh = vi.fn()
    createLeaveRequestsRealtime(refresh, { client: client as any, delayMs: 500 }).start()

    emit()
    vi.advanceTimersByTime(400)
    emit()
    vi.advanceTimersByTime(400)
    expect(refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('does not subscribe twice and cancels a pending refresh on stop', () => {
    const { client, channel, emit } = createClient()
    const refresh = vi.fn()
    const realtime = createLeaveRequestsRealtime(refresh, { client: client as any })
    realtime.start()
    realtime.start()
    expect(client.channel).toHaveBeenCalledTimes(1)

    emit()
    realtime.stop()
    vi.advanceTimersByTime(LEAVE_REQUESTS_REALTIME_DEBOUNCE_MS * 2)
    expect(refresh).not.toHaveBeenCalled()
    expect(client.removeChannel).toHaveBeenCalledWith(channel)

    realtime.stop()
    expect(client.removeChannel).toHaveBeenCalledTimes(1)
  })
})
