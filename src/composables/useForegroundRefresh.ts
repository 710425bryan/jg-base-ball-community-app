import { onMounted, onUnmounted } from 'vue'

/** Refresh permission-scoped data when a user returns to an already open page. */
export const useForegroundRefresh = (
  refresh: () => void | Promise<unknown>,
  events: string[] = []
) => {
  const run = () => {
    if (document.visibilityState === 'hidden') return
    void Promise.resolve().then(refresh).catch(() => { /* Owner displays fetch errors. */ })
  }
  onMounted(() => {
    window.addEventListener('focus', run)
    document.addEventListener('visibilitychange', run)
    events.forEach(event => window.addEventListener(event, run))
  })
  onUnmounted(() => {
    window.removeEventListener('focus', run)
    document.removeEventListener('visibilitychange', run)
    events.forEach(event => window.removeEventListener(event, run))
  })
}
