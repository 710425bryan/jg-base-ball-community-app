const APP_RELOAD_QUERY_PARAM = 'app_reload'
const DEFAULT_RELOAD_TARGET = '/dashboard'
const SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 4000
const SERVICE_WORKER_MAX_UPDATE_ATTEMPTS = 5
const SERVICE_WORKER_PENDING_INSTALL_STATES = new Set<ServiceWorkerState>([
  'parsed',
  'installing'
])

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

const waitForServiceWorkerToFinishInstall = async (worker: ServiceWorker) => {
  if (!SERVICE_WORKER_PENDING_INSTALL_STATES.has(worker.state)) {
    return worker
  }

  return new Promise<ServiceWorker>((resolve) => {
    let resolved = false
    let timeoutId: number | null = null

    const finish = () => {
      if (resolved) return
      resolved = true

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }

      worker.removeEventListener('statechange', handleStateChange)
      resolve(worker)
    }

    const handleStateChange = () => {
      if (!SERVICE_WORKER_PENDING_INSTALL_STATES.has(worker.state)) {
        finish()
      }
    }

    worker.addEventListener('statechange', handleStateChange)

    timeoutId = window.setTimeout(() => {
      finish()
    }, SERVICE_WORKER_ACTIVATION_TIMEOUT_MS)
  })
}

const activateLatestServiceWorker = async (registration: ServiceWorkerRegistration) => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  if (!('serviceWorker' in navigator) || !navigator.serviceWorker) {
    return false
  }

  let controllerChanged = false
  let cleanupControllerChangeListener = () => {}

  const controllerChangePromise = new Promise<boolean>((resolve) => {
    const handleControllerChange = () => {
      controllerChanged = true
      resolve(true)
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange, { once: true })

    cleanupControllerChangeListener = () => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange
      )
    }
  })

  try {
    await registration.update()

    let updateWorker = registration.installing || registration.waiting
    if (updateWorker && SERVICE_WORKER_PENDING_INSTALL_STATES.has(updateWorker.state)) {
      await Promise.race([
        waitForServiceWorkerToFinishInstall(updateWorker),
        controllerChangePromise
      ])
    }

    if (controllerChanged) {
      return true
    }

    updateWorker = registration.waiting || updateWorker

    if (!updateWorker || updateWorker.state === 'redundant') {
      return false
    }

    if (updateWorker.state === 'activated') {
      return true
    }

    try {
      updateWorker.postMessage({ type: 'SKIP_WAITING' })
    } catch (error) {
      console.warn('[AppUpdate] Failed to activate waiting service worker', error)
      return false
    }

    return new Promise<boolean>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        resolve(controllerChanged)
      }, SERVICE_WORKER_ACTIVATION_TIMEOUT_MS)

      controllerChangePromise.then((didChange) => {
        window.clearTimeout(timeoutId)
        resolve(didChange)
      })
    })
  } finally {
    cleanupControllerChangeListener()
  }
}

const applyServiceWorkerUpdates = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !navigator.serviceWorker) {
    return false
  }

  let activatedUpdate = false

  for (let attempt = 0; attempt < SERVICE_WORKER_MAX_UPDATE_ATTEMPTS; attempt += 1) {
    const registrations = await navigator.serviceWorker.getRegistrations()

    if (registrations.length === 0) {
      break
    }

    let activatedThisRound = false

    for (const registration of registrations) {
      activatedThisRound = await activateLatestServiceWorker(registration) || activatedThisRound
    }

    if (!activatedThisRound) {
      break
    }

    activatedUpdate = true
  }

  return activatedUpdate
}

export const refreshAppShell = async (targetFullPath?: string | null) => {
  if (typeof window === 'undefined') return

  const routePath = normalizeRouteFullPath(
    targetFullPath ?? getCurrentRouteFullPathFromLocation()
  )

  try {
    await applyServiceWorkerUpdates()
  } catch (error) {
    console.warn('[AppUpdate] Failed to prepare app shell refresh', error)
  }

  reloadAppShell(routePath)
}
