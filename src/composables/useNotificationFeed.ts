import { computed, ref } from 'vue'
import { supabase } from '@/services/supabase'
import {
  buildNotificationFeedItemId,
  type NotificationFeedItem,
  type NotificationFeedRow
} from '@/types/dashboard'
import {
  isSupabaseRpcMissingError,
  isSupabaseRpcUnavailable,
  markSupabaseRpcUnavailable
} from '@/utils/supabaseRpc'
import { normalizePushDeepLinkTarget } from '@/utils/pushDeepLink'
import { usePermissionsStore } from '@/stores/permissions'

type NotificationFeedFetcherOptions = {
  includeFeeReminders?: boolean
}
type NotificationFeedFetcher = (limit: number, options?: NotificationFeedFetcherOptions) => Promise<NotificationFeedRow[]>
type NotificationFeedLoadOptions = {
  force?: boolean
  includeFeeReminders?: boolean
  staleMs?: number
}
type FeedRequest = { limit: number; includeFeeReminders: boolean; force: boolean }
type FeedFlight = {
  generation: number
  active: FeedRequest
  queued: FeedRequest | null
  promise: Promise<NotificationFeedItem[]>
}

const normalizeLimit = (limit: number) => Math.min(Math.max(limit, 1), 50)

export const mapNotificationFeedRow = (row: NotificationFeedRow): NotificationFeedItem => ({
  id: buildNotificationFeedItemId(row.source, row.id),
  source: row.source,
  title: row.title,
  body: row.body,
  createdAt: row.created_at,
  link: normalizePushDeepLinkTarget(row.link),
  highlightMemberId: row.highlight_member_id ?? null
})

export const mergeNotificationFeedItems = (
  current: NotificationFeedItem[],
  incoming: NotificationFeedItem[],
  limit: number
) => {
  const merged = new Map<string, NotificationFeedItem>()

  for (const item of current) {
    merged.set(item.id, item)
  }

  for (const item of incoming) {
    merged.set(item.id, item)
  }

  return [...merged.values()]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, normalizeLimit(limit))
}

const fetchNotificationFeedFromRpc: NotificationFeedFetcher = async (limit, options = {}) => {
  const { data, error } = await supabase.rpc('get_notification_feed', {
    p_limit: normalizeLimit(limit),
    p_include_fee_reminders: Boolean(options.includeFeeReminders)
  })

  if (error) throw error

  // Recheck after awaiting the RPC: the role can change while the request runs,
  // and older deployed feed RPCs still allow training for linked members.
  const canViewTraining = usePermissionsStore().can('training', 'VIEW')
  return Array.isArray(data)
    ? (data as NotificationFeedRow[]).filter(row => row.source !== 'training' || canViewTraining)
    : []
}

let sharedFallbackFetcher: NotificationFeedFetcher | null = null

export const configureNotificationFeedFallbackFetcher = (
  fetcher: NotificationFeedFetcher | null
) => {
  sharedFallbackFetcher = fetcher
}

export const createNotificationFeedController = (
  fetcher: NotificationFeedFetcher = fetchNotificationFeedFromRpc,
  options: {
    rpcName?: string
    getFallbackFetcher?: () => NotificationFeedFetcher | null
  } = {}
) => {
  const notifications = ref<NotificationFeedItem[]>([])
  const isLoaded = ref(false)
  const isLoading = ref(false)

  let inFlight: FeedFlight | null = null
  let feedLimit = 10
  let generation = 0
  let lastLoadedAt = 0
  let loadedWithFeeReminders = false
  let loadedLimit = 0

  const fetchRows = async (request: FeedRequest) => {
    const fallbackFetcher = options.getFallbackFetcher?.() || null
    const fetchOptions = { includeFeeReminders: request.includeFeeReminders }
    if (options.rpcName && fallbackFetcher && isSupabaseRpcUnavailable(options.rpcName)) {
      return fallbackFetcher(request.limit, fetchOptions)
    }
    try {
      return await fetcher(request.limit, fetchOptions)
    } catch (error) {
      if (options.rpcName && fallbackFetcher && isSupabaseRpcMissingError(error, options.rpcName)) {
        markSupabaseRpcUnavailable(options.rpcName)
        console.warn(`${options.rpcName} RPC 尚未部署，改用前端查詢 fallback。`)
        return fallbackFetcher(request.limit, fetchOptions)
      }
      throw error
    }
  }

  const runFlight = async (flight: FeedFlight): Promise<NotificationFeedItem[]> => {
    try {
      while (flight.generation === generation) {
        const request = flight.active
        try {
          const rows = await fetchRows(request)
          if (flight.generation !== generation) return notifications.value

          // A mutation during the request needs a fresh response before publishing it.
          if (!flight.queued?.force) {
            notifications.value = mergeNotificationFeedItems(
              // These sources must be revalidated after role/permission changes.
              notifications.value.filter(note => note.source !== 'coach_leave' && note.source !== 'training'),
              rows.map(mapNotificationFeedRow),
              request.limit
            )
            isLoaded.value = true
            lastLoadedAt = Date.now()
            loadedLimit = request.limit
            loadedWithFeeReminders = request.includeFeeReminders
          }
        } catch (error) {
          if (flight.generation !== generation) return notifications.value
          if (!flight.queued) throw error
        }

        if (!flight.queued) return notifications.value
        flight.active = flight.queued
        flight.queued = null
      }
      return notifications.value
    } finally {
      if (inFlight === flight) {
        isLoading.value = false
        inFlight = null
      }
    }
  }

  const loadNotificationFeed = async (limit = 10, loadOptions: NotificationFeedLoadOptions = {}) => {
    feedLimit = normalizeLimit(limit)
    const includeFeeReminders = Boolean(loadOptions.includeFeeReminders)
    const now = Date.now()
    const staleMs = Math.max(0, loadOptions.staleMs ?? 60_000)

    if (loadOptions.force) isLoaded.value = false

    if (
      isLoaded.value &&
      !inFlight &&
      feedLimit <= loadedLimit &&
      (!includeFeeReminders || loadedWithFeeReminders) &&
      now - lastLoadedAt < staleMs
    ) {
      return notifications.value
    }

    if (inFlight) {
      const active = inFlight.active
      if (loadOptions.force || feedLimit > active.limit || (includeFeeReminders && !active.includeFeeReminders)) {
        const queued = inFlight.queued
        inFlight.queued = {
          limit: Math.max(feedLimit, active.limit, queued?.limit ?? 0),
          includeFeeReminders: includeFeeReminders || active.includeFeeReminders || Boolean(queued?.includeFeeReminders),
          force: Boolean(loadOptions.force || queued?.force)
        }
      }
      return inFlight.promise
    }

    isLoading.value = true
    const flight: FeedFlight = {
      generation,
      active: { limit: feedLimit, includeFeeReminders, force: Boolean(loadOptions.force) },
      queued: null,
      promise: Promise.resolve([])
    }
    inFlight = flight
    flight.promise = runFlight(flight)
    return flight.promise
  }

  const upsertNotification = (notification: NotificationFeedItem) => {
    notifications.value = mergeNotificationFeedItems(
      notifications.value,
      [notification],
      feedLimit
    )
  }

  const resetNotificationFeed = () => {
    generation += 1
    notifications.value = []
    isLoaded.value = false
    isLoading.value = false
    inFlight = null
    feedLimit = 10
    lastLoadedAt = 0
    loadedWithFeeReminders = false
    loadedLimit = 0
  }

  return {
    notifications,
    isLoaded,
    isLoading,
    loadNotificationFeed,
    upsertNotification,
    resetNotificationFeed
  }
}

const sharedNotificationFeedController = createNotificationFeedController(fetchNotificationFeedFromRpc, {
  rpcName: 'get_notification_feed',
  getFallbackFetcher: () => sharedFallbackFetcher
})

export const useNotificationFeed = () => {
  const permissions = usePermissionsStore()
  return {
    ...sharedNotificationFeedController,
    // Hide cached or locally inserted training events immediately when VIEW is
    // revoked, without waiting for a network refresh to complete.
    notifications: computed(() => sharedNotificationFeedController.notifications.value.filter(
      note => note.source !== 'training' || permissions.can('training', 'VIEW')
    ))
  }
}
