import { ref } from 'vue'
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

type NotificationFeedFetcherOptions = {
  includeFeeReminders?: boolean
}
type NotificationFeedFetcher = (limit: number, options?: NotificationFeedFetcherOptions) => Promise<NotificationFeedRow[]>
type NotificationFeedLoadOptions = {
  force?: boolean
  includeFeeReminders?: boolean
  staleMs?: number
}

const normalizeLimit = (limit: number) => Math.min(Math.max(limit, 1), 50)

export const mapNotificationFeedRow = (row: NotificationFeedRow): NotificationFeedItem => ({
  id: buildNotificationFeedItemId(row.source, row.id),
  source: row.source,
  title: row.title,
  body: row.body,
  createdAt: row.created_at,
  link: row.link,
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

  return Array.isArray(data) ? (data as NotificationFeedRow[]) : []
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

  let inFlight: Promise<NotificationFeedItem[]> | null = null
  let feedLimit = 10
  let generation = 0
  let lastLoadedAt = 0
  let loadedWithFeeReminders = false

  const loadNotificationFeed = async (limit = 10, loadOptions: NotificationFeedLoadOptions = {}) => {
    feedLimit = normalizeLimit(limit)
    const includeFeeReminders = Boolean(loadOptions.includeFeeReminders)
    const now = Date.now()
    const staleMs = Math.max(0, loadOptions.staleMs ?? 60_000)

    if (
      isLoaded.value &&
      !inFlight &&
      (!includeFeeReminders || loadedWithFeeReminders) &&
      now - lastLoadedAt < staleMs
    ) {
      return notifications.value
    }

    if (loadOptions.force) {
      generation += 1
      inFlight = null
      isLoaded.value = false
    }

    if (inFlight) {
      return inFlight
    }

    isLoading.value = true
    const requestGeneration = generation
    inFlight = (async () => {
      const fallbackFetcher = options.getFallbackFetcher?.() || null

      if (options.rpcName && fallbackFetcher && isSupabaseRpcUnavailable(options.rpcName)) {
        return fallbackFetcher(feedLimit, { includeFeeReminders })
      }

      try {
        return await fetcher(feedLimit, { includeFeeReminders })
      } catch (error) {
        if (options.rpcName && fallbackFetcher && isSupabaseRpcMissingError(error, options.rpcName)) {
          markSupabaseRpcUnavailable(options.rpcName)
          console.warn(`${options.rpcName} RPC 尚未部署，改用前端查詢 fallback。`)
          return fallbackFetcher(feedLimit, { includeFeeReminders })
        }

        throw error
      }
    })()
      .then((rows) => {
        if (requestGeneration !== generation) {
          return notifications.value
        }

        notifications.value = mergeNotificationFeedItems(
          notifications.value,
          rows.map(mapNotificationFeedRow),
          feedLimit
        )
        isLoaded.value = true
        lastLoadedAt = Date.now()
        loadedWithFeeReminders = includeFeeReminders || loadedWithFeeReminders
        return notifications.value
      })
      .finally(() => {
        isLoading.value = false
        inFlight = null
      })

    return inFlight
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

export const useNotificationFeed = () => sharedNotificationFeedController
