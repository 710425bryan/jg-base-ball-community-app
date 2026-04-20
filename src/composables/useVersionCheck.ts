import { ref } from 'vue'

const hasUpdateAvailable = ref(false)
const currentVersion = __APP_VERSION__
const isVersionCheckEnabled = !import.meta.env.DEV

let hasStartedVersionPolling = false
let intervalId: number | null = null
let initialTimeoutId: number | null = null
let isRefreshingApp = false

const checkForUpdate = async () => {
  if (!isVersionCheckEnabled || hasUpdateAvailable.value) return

  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store'
    })
    if (!response.ok) return

    const data = await response.json()

    if (data && data.version && data.version !== currentVersion) {
      hasUpdateAvailable.value = true
      console.log(`[VersionCheck] 發現新版本: ${data.version} (目前: ${currentVersion})`)
    }
  } catch (err) {
    console.warn('[VersionCheck] 版本檢查失敗', err)
  }
}

const handleVisibilityChange = () => {
  if (typeof document === 'undefined') return

  if (document.visibilityState === 'visible') {
    void checkForUpdate()
  }
}

const ensureVersionPollingStarted = () => {
  if (
    !isVersionCheckEnabled ||
    hasStartedVersionPolling ||
    typeof window === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return
  }

  hasStartedVersionPolling = true

  initialTimeoutId = window.setTimeout(() => {
    void checkForUpdate()
  }, 10000)

  intervalId = window.setInterval(() => {
    void checkForUpdate()
  }, 5 * 60 * 1000)

  document.addEventListener('visibilitychange', handleVisibilityChange)
}

const activateWaitingServiceWorker = async (registration: ServiceWorkerRegistration) => {
  const waitingWorker = registration.waiting
  if (!waitingWorker || typeof navigator === 'undefined') return false

  return new Promise<boolean>((resolve) => {
    let resolved = false

    const finish = (didActivate: boolean) => {
      if (resolved) return
      resolved = true
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      resolve(didActivate)
    }

    const handleControllerChange = () => {
      finish(true)
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })

    window.setTimeout(() => {
      finish(false)
    }, 4000)
  })
}

const refreshApp = async () => {
  if (typeof window === 'undefined' || isRefreshingApp) return

  isRefreshingApp = true
  hasUpdateAvailable.value = false

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      let activatedWaitingWorker = false

      for (const registration of registrations) {
        await registration.update()
        activatedWaitingWorker = await activateWaitingServiceWorker(registration) || activatedWaitingWorker
      }

      if (activatedWaitingWorker) {
        return
      }
    }
  } catch (err) {
    console.warn('[VersionCheck] 重新整理更新版本失敗', err)
  }

  window.location.reload()
}

export function useVersionCheck() {
  ensureVersionPollingStarted()

  return {
    hasUpdateAvailable,
    refreshApp,
    currentVersion
  }
}
