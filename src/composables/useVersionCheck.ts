import { ref, onMounted, onUnmounted } from 'vue'

export function useVersionCheck() {
  const hasUpdateAvailable = ref(false)
  const currentVersion = __APP_VERSION__
  
  let intervalId: number | null = null

  const checkForUpdate = async () => {
    // 避免在檢查剛果中產生無限迴圈，或是剛更新馬上又檢查
    if (hasUpdateAvailable.value) return
    
    try {
      const response = await fetch(`/version.json?t=${Date.now()}`)
      if (!response.ok) return
      
      const data = await response.json()
      
      // 比對伺服器的版號與當前載入的版號
      if (data && data.version && data.version !== currentVersion) {
        hasUpdateAvailable.value = true
        console.log(`[VersionCheck] 發現新版本: ${data.version} (目前: ${currentVersion})`)
      }
    } catch (err) {
      console.warn('[VersionCheck] 版本檢查失敗', err)
    }
  }

  const handleVisibilityChange = () => {
    // 當使用者切換回此分頁時，主動檢查一次
    if (document.visibilityState === 'visible') {
      checkForUpdate()
    }
  }

  const refreshApp = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.update()
        })
      })
    }
    window.location.reload()
  }

  onMounted(() => {
    // 首次進入過 10 秒後檢查一次
    setTimeout(checkForUpdate, 10000)
    
    // 之後每隔 5 分鐘檢查一次
    intervalId = window.setInterval(checkForUpdate, 5 * 60 * 1000)
    
    // 監聽網頁可見度變化
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onUnmounted(() => {
    if (intervalId !== null) {
      clearInterval(intervalId)
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return {
    hasUpdateAvailable,
    refreshApp,
    currentVersion
  }
}
