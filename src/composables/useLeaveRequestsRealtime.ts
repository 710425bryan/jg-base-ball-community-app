import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/services/supabase'

export const LEAVE_REQUESTS_REALTIME_CHANNEL = 'leave-requests-stats-changes'
export const LEAVE_REQUESTS_REALTIME_DEBOUNCE_MS = 800

type RealtimeClient = Pick<SupabaseClient, 'channel' | 'removeChannel'>

interface LeaveRequestsRealtimeOptions {
  client?: RealtimeClient
  delayMs?: number
}

/**
 * Leave request changes arrive one event per row (a batch insert or a roll-call
 * save can emit dozens). Coalesce a burst into a single refresh of the list and
 * stats instead of re-querying for every row.
 *
 * Only `leave_requests` is subscribed: `attendance_events` / `attendance_records`
 * are not in the production `supabase_realtime` publication (checked 2026-10-17),
 * so those subscriptions never delivered events.
 */
export function createLeaveRequestsRealtime(
  refresh: () => void,
  { client = supabase, delayMs = LEAVE_REQUESTS_REALTIME_DEBOUNCE_MS }: LeaveRequestsRealtimeOptions = {}
) {
  let channel: RealtimeChannel | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const scheduleRefresh = () => {
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      refresh()
    }, delayMs)
  }

  const start = () => {
    if (channel) return
    channel = client.channel(LEAVE_REQUESTS_REALTIME_CHANNEL)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, scheduleRefresh)
      .subscribe()
  }

  const stop = () => {
    clearTimer()
    if (channel) {
      void client.removeChannel(channel)
      channel = null
    }
  }

  return { start, stop }
}
