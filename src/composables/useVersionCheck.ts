import { ref } from 'vue'
import { getCurrentRouteFullPathFromLocation, refreshAppShell } from '@/utils/appUpdate'

const hasUpdateAvailable = ref(false)
const isApplyingUpdate = ref(false)
const currentVersion = __APP_VERSION__
const isVersionCheckEnabled = true
const DEV_UPDATE_VERSION_STORAGE_KEY = 'jg-baseball-dev-update-version'
const DEV_DISMISSED_UPDATE_VERSION_STORAGE_KEY = 'jg-baseball-dev-dismissed-update-version'
const DEV_UPDATE_QUERY_PARAM_KEYS = ['dev_update', 'dev_update_version'] as const

let hasStartedVersionPolling = false
let intervalId: number | null = null
let initialTimeoutId: number | null = null
let pendingUpdateVersion: string | null = null

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

const fetchVersionJson = async () => {
  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: 'no-store'
  })
  if (!response.ok) return null

  const data = await response.json()

  return normalizeVersion(data?.version)
}

const getDismissedDevUpdateVersion = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null

  return normalizeVersion(window.localStorage.getItem(DEV_DISMISSED_UPDATE_VERSION_STORAGE_KEY))
}

const dismissCurrentDevUpdate = async () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return

  let dismissedVersion = pendingUpdateVersion || getDismissedDevUpdateVersion()

  if (!dismissedVersion) {
    try {
      dismissedVersion = await fetchVersionJson()
    } catch {
      dismissedVersion = getDevVersionOverride()
    }
  }

  if (dismissedVersion) {
    window.localStorage.setItem(DEV_DISMISSED_UPDATE_VERSION_STORAGE_KEY, dismissedVersion)
  }

  pendingUpdateVersion = null
}

const removeDevUpdateParams = (params: URLSearchParams) => {
  let didRemove = false

  DEV_UPDATE_QUERY_PARAM_KEYS.forEach((key) => {
    if (params.has(key)) {
      params.delete(key)
      didRemove = true
    }
  })

  return didRemove
}

const removeDevUpdateParamsFromRoute = (routeFullPath: string) => {
  const routeHashIndex = routeFullPath.indexOf('#')
  const pathAndQuery = routeHashIndex >= 0
    ? routeFullPath.slice(0, routeHashIndex)
    : routeFullPath
  const routeHash = routeHashIndex >= 0 ? routeFullPath.slice(routeHashIndex) : ''
  const queryIndex = pathAndQuery.indexOf('?')

  if (queryIndex < 0) return routeFullPath

  const path = pathAndQuery.slice(0, queryIndex)
  const queryParams = new URLSearchParams(pathAndQuery.slice(queryIndex + 1))

  if (!removeDevUpdateParams(queryParams)) return routeFullPath

  const nextQuery = queryParams.toString()

  return `${path}${nextQuery ? `?${nextQuery}` : ''}${routeHash}`
}

const getRefreshTargetRoute = () => {
  const currentRoute = getCurrentRouteFullPathFromLocation()

  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return currentRoute
  }

  window.localStorage.removeItem(DEV_UPDATE_VERSION_STORAGE_KEY)

  const targetRoute = removeDevUpdateParamsFromRoute(currentRoute)
  const nextUrl = new URL(window.location.href)
  const didRemoveDocumentParams = removeDevUpdateParams(nextUrl.searchParams)
  const didRemoveRouteParams = targetRoute !== currentRoute

  if (didRemoveDocumentParams || didRemoveRouteParams) {
    nextUrl.hash = `#${targetRoute}`
    window.history.replaceState(window.history.state, '', nextUrl.toString())
  }

  return targetRoute
}

const checkForUpdate = async () => {
  if (!isVersionCheckEnabled || hasUpdateAvailable.value || isApplyingUpdate.value) return

  try {
    const latestVersion = getDevVersionOverride() || await fetchVersionJson()

    if (
      latestVersion &&
      latestVersion !== currentVersion &&
      latestVersion !== getDismissedDevUpdateVersion()
    ) {
      pendingUpdateVersion = latestVersion
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

const refreshApp = async () => {
  if (typeof window === 'undefined' || isApplyingUpdate.value) return

  isApplyingUpdate.value = true
  hasUpdateAvailable.value = false

  try {
    await dismissCurrentDevUpdate()
    await refreshAppShell(getRefreshTargetRoute())
  } catch (err) {
    console.warn('[VersionCheck] 重新整理更新版本失敗', err)
  } finally {
    isApplyingUpdate.value = false
  }
}

export function useVersionCheck() {
  ensureVersionPollingStarted()

  return {
    hasUpdateAvailable,
    isApplyingUpdate,
    refreshApp,
    currentVersion
  }
}
