import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import { VueQueryPlugin } from '@tanstack/vue-query'
import ElementPlus from 'element-plus'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import 'element-plus/dist/index.css'
import './style.css'
import App from './App.vue'

import router from './router'

const applyInitialPushTarget = () => {
  if (typeof window === 'undefined') return

  const currentUrl = new URL(window.location.href)
  const pushTarget = currentUrl.searchParams.get('push_target')
  if (!pushTarget) return

  currentUrl.searchParams.delete('push_target')
  const remainingSearch = currentUrl.searchParams.toString()
  const nextUrl = `${currentUrl.pathname}${remainingSearch ? `?${remainingSearch}` : ''}#/push-entry?target=${encodeURIComponent(pushTarget)}`

  window.history.replaceState(null, '', nextUrl)
}

applyInitialPushTarget()

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(VueQueryPlugin)
app.use(ElementPlus, {
  locale: zhTw,
})

app.mount('#app')
