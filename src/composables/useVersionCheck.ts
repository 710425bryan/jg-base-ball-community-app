import { ref } from 'vue'
import { getCurrentRouteFullPathFromLocation, reloadAppShell, refreshAppShell } from '@/utils/appUpdate'

const hasUpdateAvailable = ref(false)
const currentVersion = __APP_VERSION__
const isVersionCheckEnabled = true
const DEV_UPDATE_VERSION_STORAGE_KEY = 'jg-baseball-dev-update-version'

let hasStartedVersionPolling = false
let intervalId: number | null = null
let initialTimeoutId: number | null = null
let isRefreshingApp = false

const normalizeVersion = (version: unknown) => {
  if (typeof version !== 'string') return null

  const normalized = version.trim()
  return normalized ? normalized : null
}

const getDevSearchParams = () => {
  if (typeof window === 'undefined') return new URLSearchParams()

  const params = new URLSearchParams(window.location.search)
  const hashQuery = window.location.hash.split('?')[1]

  if (hashQuery) {
    new URLSearchParams(hashQuery).forEach((value, key) => {
      params.set(key, value)
    })
  }

  return params
}

const getDevVersionOverride = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null

  const params = getDevSearchParams()
  const queryVersion = normalizeVersion(params.get('dev_update_version'))

  if (queryVersion === 'clear') {
    window.localStorage.removeItem(DEV_UPDATE_VERSION_STORAGE_KEY)
    return null
  }

  if (queryVersion) {
    window.localStorage.setItem(DEV_UPDATE_VERSION_STORAGE_KEY, queryVersion)
    return queryVersion
  }

  if (params.get('dev_update') === '1') {
    return `${currentVersion}-dev`
  }

  return normalizeVersion(window.localStorage.getItem(DEV_UPDATE_VERSION_STORAGE_KEY))
}

const checkForUpdate = async () => {
  if (!isVersionCheckEnabled || hasUpdateAvailable.value) return

  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store'
    })
    if (!response.ok) return

    const data = await response.json()
    const latestVersion = getDevVersionOverride() || normalizeVersion(data?.version)

    if (latestVersion && latestVersion !== currentVersion) {
      hasUpdateAvailable.value = true
      console.log(`[VersionCheck] 發現新版本: ${latestVersion} (目前: ${currentVersion})`)
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
  }, import.meta.env.DEV ? 1000 : 10000)

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
      reloadAppShell(getCurrentRouteFullPathFromLocation())
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

  await refreshAppShell(getCurrentRouteFullPathFromLocation())
}

export function useVersionCheck() {
  ensureVersionPollingStarted()

  return {
    hasUpdateAvailable,
    refreshApp,
    currentVersion
  }
}
