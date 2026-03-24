import { precacheAndRoute } from 'workbox-precaching'

// 預先快取 Vite 打包的所有資源
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
