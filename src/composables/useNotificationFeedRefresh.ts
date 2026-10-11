import { onMounted, onUnmounted, watch } from 'vue'
import { useForegroundRefresh } from './useForegroundRefresh'
import { useNotificationFeed } from './useNotificationFeed'

type RefreshReason = 'initial' | 'foreground' | 'open' | 'changed'
type NotificationFeedScope = {
  userId: string
  profileUserId: string
  role: string
  permissionRole: string
  permissionsLoading: boolean
  permissionSignature: string
}

export const watchNotificationFeedScope = (
  scope: () => NotificationFeedScope,
  onChange: (scope: NotificationFeedScope) => void
) => watch(scope, (current, previous) => {
  if (previous && (Object.keys(current) as (keyof NotificationFeedScope)[])
    .every(key => current[key] === previous[key])) return
  onChange(current)
}, { immediate: true })

/** Keep automatic refreshes cached, while mutations still revoke stale visibility. */
export const useNotificationFeedRefresh = (
  canLoad: () => boolean,
  load = useNotificationFeed().loadNotificationFeed
) => {
  let hasPendingChange = false
  const refreshNotificationFeed = async (reason: RefreshReason = 'initial') => {
    if (reason === 'changed') hasPendingChange = true
    if (!canLoad() || (hasPendingChange && document.visibilityState === 'hidden')) return
    const force = hasPendingChange
    hasPendingChange = false
    try {
      await load(10, {
        force,
        includeFeeReminders: reason === 'open',
        staleMs: reason === 'initial' ? 60_000 : 30_000
      })
    } catch (error) {
      if (force) hasPendingChange = true
      console.error('Error fetching notification feed:', error)
    }
  }

  useForegroundRefresh(() => refreshNotificationFeed('foreground'))
  const onChanged = () => { void refreshNotificationFeed('changed') }
  onMounted(() => window.addEventListener('coach-leave-changed', onChanged))
  onUnmounted(() => window.removeEventListener('coach-leave-changed', onChanged))

  return { refreshNotificationFeed }
}
