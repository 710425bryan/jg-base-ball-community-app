import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import ElementPlus from 'element-plus'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'

import router from './router'
import {
  PUSH_ENTRY_ROUTE,
  PUSH_NOTIFICATION_CLICK_MESSAGE,
  buildPushEntryHash,
  clearPendingPushDeepLinkTarget,
  consumePendingPushDeepLinkTarget,
  normalizePushDeepLinkTarget
} from '@/utils/pushDeepLink'

const PUSH_DEEP_LINK_CONSUME_RETRY_DELAYS_MS = [0, 250, 750, 1500, 3000]

const applyInitialPushTarget = () => {
  if (typeof window === 'undefined') return null

  const currentUrl = new URL(window.location.href)
  const pushTarget = currentUrl.searchParams.get('push_target') || getPushEntryTargetFromHash(currentUrl.hash)
  if (!pushTarget) return null

  const normalizedTarget = normalizePushDeepLinkTarget(pushTarget, currentUrl.origin)

  if (currentUrl.searchParams.has('push_target')) {
    currentUrl.searchParams.delete('push_target')
    const remainingSearch = currentUrl.searchParams.toString()
    const nextUrl = `${currentUrl.pathname}${remainingSearch ? `?${remainingSearch}` : ''}${buildPushEntryHash(normalizedTarget)}`

    window.history.replaceState(null, '', nextUrl)
  }

  return normalizedTarget
}

const getPushEntryTargetFromHash = (hash: string) => {
  const hashPath = hash.startsWith('#') ? hash.slice(1) : hash
  if (!hashPath.startsWith(PUSH_ENTRY_ROUTE)) return null

  const queryIndex = hashPath.indexOf('?')
  if (queryIndex < 0) return null

  return new URLSearchParams(hashPath.slice(queryIndex + 1)).get('target')
}

const initialPushTarget = applyInitialPushTarget()

const routePushDeepLinkTarget = async (rawTarget: unknown) => {
  const targetPath = normalizePushDeepLinkTarget(rawTarget)

  try {
    await router.isReady()
    if (router.currentRoute.value.fullPath === targetPath) return
    await router.push(targetPath)
  } catch (error) {
    console.warn('Unable to route push notification click target:', error)
  }
}

let isConsumingPendingPushTarget = false

const consumeAndRoutePendingPushTarget = async () => {
  if (isConsumingPendingPushTarget) return

  isConsumingPendingPushTarget = true

  try {
    const targetPath = await consumePendingPushDeepLinkTarget()
    if (targetPath) {
      await routePushDeepLinkTarget(targetPath)
    }
  } catch (error) {
    console.warn('Unable to consume pending push notification target:', error)
  } finally {
    isConsumingPendingPushTarget = false
  }
}

const schedulePendingPushTargetConsume = () => {
  if (typeof window === 'undefined') {
    void consumeAndRoutePendingPushTarget()
    return
  }

  PUSH_DEEP_LINK_CONSUME_RETRY_DELAYS_MS.forEach((delayMs) => {
    window.setTimeout(() => {
      void consumeAndRoutePendingPushTarget()
    }, delayMs)
  })
}

const registerPushNotificationClickBridge = () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: string; targetPath?: unknown; url?: unknown } | null
    if (!data || data.type !== PUSH_NOTIFICATION_CLICK_MESSAGE) return

    void routePushDeepLinkTarget(data.targetPath ?? data.url)
    schedulePendingPushTargetConsume()
  })
}

const registerPendingPushTargetConsumers = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  window.addEventListener('pageshow', () => {
    schedulePendingPushTargetConsume()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      schedulePendingPushTargetConsume()
    }
  })
}

const app = createApp(App)

app.use(createPinia())
app.use(router)
registerPushNotificationClickBridge()
registerPendingPushTargetConsumers()
app.use(VueQueryPlugin)
app.use(ElementPlus, {
  locale: zhTw,
})

app.mount('#app')

if (initialPushTarget) {
  void routePushDeepLinkTarget(initialPushTarget)
  void clearPendingPushDeepLinkTarget().catch((error) => {
    console.warn('Unable to clear pending push notification target:', error)
  })
  schedulePendingPushTargetConsume()
} else {
  schedulePendingPushTargetConsume()
}
