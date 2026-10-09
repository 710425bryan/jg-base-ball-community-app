import { supabase } from '@/services/supabase'
import { getProfileAccessState, type ProfileAccessInput } from '@/utils/profileAccess'

const FALLBACK_CHECK_MS = 30_000
const REQUEST_TIMEOUT_MS = 10_000

// Only the signed-in user's row is observed; the existing self SELECT policy
// must continue to allow that row even after is_active becomes false.
export const createProfileAccessMonitor = (
  userId: string,
  initialProfile: ProfileAccessInput,
  onDenied: (message: string) => void
) => {
  let stopped = false
  let revision = 0
  let inFlight: Promise<void> | null = null
  let requestController: AbortController | null = null
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  let snapshot = initialProfile

  const accept = (next: ProfileAccessInput) => {
    if (stopped) return
    snapshot = next
    clearTimeout(expiryTimer)
    const state = getProfileAccessState(next)
    if (!state.allowed) {
      onDenied(state.message)
      return
    }
    const end = next.access_end ? Date.parse(next.access_end) : NaN
    if (Number.isFinite(end)) {
      expiryTimer = setTimeout(() => accept(snapshot), Math.min(Math.max(end - Date.now() + 1, 1), 2_147_483_647))
    }
  }

  const check = (): Promise<void> => {
    if (stopped) return Promise.resolve()
    if (inFlight) return inFlight
    const readRevision = revision
    const controller = new AbortController()
    requestController = controller
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    inFlight = (async () => {
      try {
        const { data, error } = await supabase.from('profiles')
          .select('id,is_active,access_start,access_end').eq('id', userId)
          .abortSignal(controller.signal).maybeSingle()
        if (stopped || readRevision !== revision || error) return
        if (!data) {
          onDenied('此帳號已無法使用，請聯絡管理員。')
          return
        }
        accept(data)
      } catch {
        // Network errors are retried by foreground/reconnect/fallback checks.
        // They are not evidence that an account was suspended.
      } finally {
        clearTimeout(timeout)
        requestController = null
        inFlight = null
      }
    })()
    return inFlight
  }

  const checkWhenVisible = () => {
    if (document.visibilityState === 'visible') void check()
  }
  const channel = supabase.channel(`profile-access:${userId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}`
    }, ({ new: row }) => {
      if (stopped || row.id !== userId || typeof row.is_active !== 'boolean') return
      revision += 1
      accept(row)
    })
    .subscribe(status => {
      // Also closes the gap between the initial profile read and subscription.
      if (status === 'SUBSCRIBED') void check()
    })

  const fallbackTimer = setInterval(checkWhenVisible, FALLBACK_CHECK_MS)
  document.addEventListener('visibilitychange', checkWhenVisible)
  window.addEventListener('online', checkWhenVisible)
  window.addEventListener('pageshow', checkWhenVisible)
  accept(initialProfile)

  return {
    check,
    stop: () => {
      if (stopped) return
      stopped = true
      requestController?.abort()
      clearTimeout(expiryTimer)
      clearInterval(fallbackTimer)
      document.removeEventListener('visibilitychange', checkWhenVisible)
      window.removeEventListener('online', checkWhenVisible)
      window.removeEventListener('pageshow', checkWhenVisible)
      void supabase.removeChannel(channel).catch(() => {})
    }
  }
}
