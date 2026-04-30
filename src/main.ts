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
  PUSH_NOTIFICATION_CLICK_MESSAGE,
  buildPushEntryHash,
  normalizePushDeepLinkTarget
} from '@/utils/pushDeepLink'

const applyInitialPushTarget = () => {
  if (typeof window === 'undefined') return

  const currentUrl = new URL(window.location.href)
  const pushTarget = currentUrl.searchParams.get('push_target')
  if (!pushTarget) return

  const normalizedTarget = normalizePushDeepLinkTarget(pushTarget, currentUrl.origin)
  currentUrl.searchParams.delete('push_target')
  const remainingSearch = currentUrl.searchParams.toString()
  const nextUrl = `${currentUrl.pathname}${remainingSearch ? `?${remainingSearch}` : ''}${buildPushEntryHash(normalizedTarget)}`

  window.history.replaceState(null, '', nextUrl)
}

applyInitialPushTarget()

const registerPushNotificationClickBridge = () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: string; targetPath?: unknown; url?: unknown } | null
    if (!data || data.type !== PUSH_NOTIFICATION_CLICK_MESSAGE) return

    const targetPath = normalizePushDeepLinkTarget(data.targetPath ?? data.url)
    void router.push(targetPath).catch((error) => {
      console.warn('Unable to route push notification click target:', error)
    })
  })
}

const app = createApp(App)

app.use(createPinia())
app.use(router)
registerPushNotificationClickBridge()
app.use(VueQueryPlugin)
app.use(ElementPlus, {
  locale: zhTw,
})

app.mount('#app')
