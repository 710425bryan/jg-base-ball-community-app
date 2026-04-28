const APP_RELOAD_QUERY_PARAM = 'app_reload'
const DEFAULT_RELOAD_TARGET = '/dashboard'
const SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 4000

export const normalizeRouteFullPath = (
  fullPath: string | null | undefined,
  fallback = DEFAULT_RELOAD_TARGET
) => {
  const routePath = typeof fullPath === 'string' ? fullPath.trim() : ''
  const normalized = routePath || fallback
  const withoutHash = normalized.startsWith('#') ? normalized.slice(1) : normalized

  return withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`
}

export const getCurrentRouteFullPathFromLocation = () => {
  if (typeof window === 'undefined') return DEFAULT_RELOAD_TARGET

  const hashPath = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash

  return normalizeRouteFullPath(hashPath)
}

export const buildAppReloadUrl = (targetFullPath?: string | null) => {
  if (typeof window === 'undefined') return ''

  const routePath = getAppReloadTargetRoute(targetFullPath)
  const nextUrl = new URL(window.location.href)

  nextUrl.searchParams.delete(APP_RELOAD_QUERY_PARAM)
  nextUrl.hash = `#${routePath}`

  return nextUrl.toString()
}

const addAppReloadQuery = (routeFullPath: string) => {
  const routeHashIndex = routeFullPath.indexOf('#')
  const pathAndQuery = routeHashIndex >= 0
    ? routeFullPath.slice(0, routeHashIndex)
    : routeFullPath
  const routeHash = routeHashIndex >= 0 ? routeFullPath.slice(routeHashIndex) : ''
  const queryIndex = pathAndQuery.indexOf('?')
  const path = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery
  const query = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : ''
  const queryParams = new URLSearchParams(query)

  queryParams.set(APP_RELOAD_QUERY_PARAM, Date.now().toString(36))

  return `${path}?${queryParams.toString()}${routeHash}`
}

const getDocumentUrlWithoutHash = (url: string) => {
  const parsedUrl = new URL(url)

  return `${parsedUrl.origin}${parsedUrl.pathname}${parsedUrl.search}`
}

export const getAppReloadTargetRoute = (targetFullPath?: string | null) => {
  return addAppReloadQuery(
    normalizeRouteFullPath(
      targetFullPath ?? getCurrentRouteFullPathFromLocation()
    )
  )
}

export const reloadAppShell = (targetFullPath?: string | null) => {
  if (typeof window === 'undefined') return

  const reloadUrl = buildAppReloadUrl(targetFullPath)
  const isSameDocumentUrl =
    getDocumentUrlWithoutHash(window.location.href) === getDocumentUrlWithoutHash(reloadUrl)

  window.location.replace(reloadUrl)

  if (isSameDocumentUrl) {
    window.setTimeout(() => {
      window.location.reload()
    }, 0)
  }
}

const activateWaitingServiceWorker = async (
  registration: ServiceWorkerRegistration,
  targetFullPath: string
) => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const waitingWorker = registration.waiting
  if (!waitingWorker || !('serviceWorker' in navigator)) {
    return false
  }

  return new Promise<boolean>((resolve) => {
    let resolved = false
    let timeoutId: number | null = null

    const finish = (didActivate: boolean) => {
      if (resolved) return
      resolved = true

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }

      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange
      )
      resolve(didActivate)
    }

    const handleControllerChange = () => {
      finish(true)
      reloadAppShell(targetFullPath)
    }

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      handleControllerChange
    )

    timeoutId = window.setTimeout(() => {
      finish(false)
    }, SERVICE_WORKER_ACTIVATION_TIMEOUT_MS)

    try {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    } catch (error) {
      console.warn('[AppUpdate] Failed to activate waiting service worker', error)
      finish(false)
    }
  })
}

export const refreshAppShell = async (targetFullPath?: string | null) => {
  if (typeof window === 'undefined') return

  const routePath = normalizeRouteFullPath(
    targetFullPath ?? getCurrentRouteFullPathFromLocation()
  )

  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()

      for (const registration of registrations) {
        await registration.update()

        if (await activateWaitingServiceWorker(registration, routePath)) {
          return
        }
      }
    }
  } catch (error) {
    console.warn('[AppUpdate] Failed to prepare app shell refresh', error)
  }

  reloadAppShell(routePath)
}
