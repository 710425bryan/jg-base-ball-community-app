export const DEFAULT_PUSH_DEEP_LINK_TARGET = '/dashboard'
export const PUSH_ENTRY_ROUTE = '/push-entry'
export const PUSH_NOTIFICATION_CLICK_MESSAGE = 'PUSH_NOTIFICATION_CLICK'
export const PUSH_DEEP_LINK_DB_NAME = 'jg-baseball-push-deeplink'
export const PUSH_DEEP_LINK_DB_VERSION = 1
export const PUSH_DEEP_LINK_STORE = 'pendingTargets'
export const PUSH_DEEP_LINK_LATEST_KEY = 'latest'
export const PUSH_DEEP_LINK_DIAGNOSTIC_KEY = 'latestDiagnostic'
export const PUSH_DEEP_LINK_CACHE_NAME = 'jg-baseball-push-deeplink-cache'
export const PUSH_DEEP_LINK_CACHE_TARGET_PATH = '/__push-deeplink/latest.json'
export const PUSH_DEEP_LINK_CACHE_DIAGNOSTIC_PATH = '/__push-deeplink/diagnostic.json'
export const DEFAULT_PENDING_PUSH_DEEP_LINK_MAX_AGE_MS = 10 * 60 * 1000

export type PendingPushDeepLinkTarget = {
  id: string
  targetPath: string
  createdAt: number
}

export type PushDeepLinkStorageStatus = 'saved' | 'failed' | 'unavailable' | 'unknown'

export type PushDeepLinkDiagnostics = {
  id?: string
  source?: string
  targetPath?: string
  createdAt?: number | string
  indexedDb?: PushDeepLinkStorageStatus
  cache?: PushDeepLinkStorageStatus
  userAgent?: string
}

export type ConsumePendingPushDeepLinkOptions = {
  maxAgeMs?: number
  now?: number
}

const getDefaultOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }

  return 'https://jg-baseball.local'
}

const toSameOriginPath = (rawTarget: string, origin: string) => {
  let nextTarget = rawTarget.trim()

  if (!nextTarget) {
    return ''
  }

  if (nextTarget.startsWith('/#')) {
    nextTarget = nextTarget.slice(2)
  } else if (nextTarget.startsWith('#')) {
    nextTarget = nextTarget.slice(1)
  } else {
    try {
      const targetUrl = new URL(nextTarget, origin)
      if (targetUrl.origin !== origin) {
        return ''
      }

      nextTarget = targetUrl.hash.startsWith('#/')
        ? targetUrl.hash.slice(1)
        : `${targetUrl.pathname}${targetUrl.search}`
    } catch {
      // Keep relative non-URL values and normalize them below.
    }
  }

  if (!nextTarget.startsWith('/')) {
    nextTarget = `/${nextTarget}`
  }

  return nextTarget
}

export const normalizePushDeepLinkTarget = (
  rawTarget: unknown,
  origin = getDefaultOrigin()
) => {
  if (typeof rawTarget !== 'string') {
    return DEFAULT_PUSH_DEEP_LINK_TARGET
  }

  const nextTarget = toSameOriginPath(rawTarget, origin)

  if (
    !nextTarget ||
    nextTarget.startsWith('//') ||
    nextTarget.startsWith(PUSH_ENTRY_ROUTE)
  ) {
    return DEFAULT_PUSH_DEEP_LINK_TARGET
  }

  try {
    const targetUrl = new URL(nextTarget, origin)
    if (targetUrl.origin === origin && targetUrl.pathname === '/match-records') {
      const matchId = targetUrl.searchParams.get('match_id')?.trim()
      if (matchId) {
        return `/calendar?match_id=${encodeURIComponent(matchId)}`
      }
    }
  } catch {
    // Keep the normalized target if it is not parseable as a URL.
  }

  return nextTarget
}

export const buildPushEntryHash = (targetPath: string) =>
  `#${PUSH_ENTRY_ROUTE}?target=${encodeURIComponent(targetPath)}`

const getCacheStorage = () => {
  if (typeof caches !== 'undefined') {
    return caches
  }

  if (typeof window !== 'undefined' && typeof window.caches !== 'undefined') {
    return window.caches
  }

  return null
}

const getCacheRequest = (path: string) => {
  const origin = getDefaultOrigin()

  return new Request(new URL(path, origin).href, {
    cache: 'no-store',
    credentials: 'same-origin'
  })
}

const readCachedJson = async <T>(path: string) => {
  const cacheStorage = getCacheStorage()
  if (!cacheStorage) return null

  const cache = await cacheStorage.open(PUSH_DEEP_LINK_CACHE_NAME)
  const response = await cache.match(getCacheRequest(path))
  if (!response) return null

  return await response.json() as T
}

const writeCachedJson = async (path: string, value: unknown) => {
  const cacheStorage = getCacheStorage()
  if (!cacheStorage) {
    throw new Error('此瀏覽器不支援 Cache Storage 推播導向暫存')
  }

  const cache = await cacheStorage.open(PUSH_DEEP_LINK_CACHE_NAME)
  await cache.put(
    getCacheRequest(path),
    new Response(JSON.stringify(value), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json'
      }
    })
  )
}

const deleteCachedJson = async (path: string) => {
  const cacheStorage = getCacheStorage()
  if (!cacheStorage) return false

  const cache = await cacheStorage.open(PUSH_DEEP_LINK_CACHE_NAME)
  return cache.delete(getCacheRequest(path))
}

const getIndexedDb = () => {
  if (typeof indexedDB !== 'undefined') {
    return indexedDB
  }

  if (typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined') {
    return window.indexedDB
  }

  return null
}

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('IndexedDB 操作失敗'))
  })

let pushDeepLinkDbPromise: Promise<IDBDatabase> | null = null

const openPushDeepLinkDb = () => {
  const dbFactory = getIndexedDb()
  if (!dbFactory) {
    return Promise.reject(new Error('此瀏覽器不支援推播導向暫存'))
  }

  if (pushDeepLinkDbPromise) return pushDeepLinkDbPromise

  pushDeepLinkDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = dbFactory.open(PUSH_DEEP_LINK_DB_NAME, PUSH_DEEP_LINK_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(PUSH_DEEP_LINK_STORE)) {
        db.createObjectStore(PUSH_DEEP_LINK_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      pushDeepLinkDbPromise = null
      reject(request.error || new Error('開啟推播導向暫存失敗'))
    }
  })

  return pushDeepLinkDbPromise
}

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'))
  })

const parseRecordCreatedAt = (createdAt: unknown) => {
  if (typeof createdAt === 'number') return createdAt
  if (typeof createdAt === 'string') {
    const parsed = Date.parse(createdAt)
    return Number.isNaN(parsed) ? null : parsed
  }

  return null
}

const readIndexedDbRecord = async <T>(key: string) => {
  const db = await openPushDeepLinkDb()
  const transaction = db.transaction(PUSH_DEEP_LINK_STORE, 'readonly')
  const record = await requestToPromise(transaction.objectStore(PUSH_DEEP_LINK_STORE).get(key)) as T | undefined

  await transactionDone(transaction)

  return record ?? null
}

const writeIndexedDbRecord = async (key: string, value: Record<string, unknown>) => {
  const db = await openPushDeepLinkDb()
  const transaction = db.transaction(PUSH_DEEP_LINK_STORE, 'readwrite')

  transaction.objectStore(PUSH_DEEP_LINK_STORE).put({
    ...value,
    id: key
  })
  await transactionDone(transaction)
}

const deleteIndexedDbRecord = async (key: string) => {
  const db = await openPushDeepLinkDb()
  const transaction = db.transaction(PUSH_DEEP_LINK_STORE, 'readwrite')

  transaction.objectStore(PUSH_DEEP_LINK_STORE).delete(key)
  await transactionDone(transaction)
}

export const savePendingPushDeepLinkTarget = async (
  rawTarget: unknown,
  options: { createdAt?: number } = {}
) => {
  const targetPath = normalizePushDeepLinkTarget(rawTarget)
  const record: PendingPushDeepLinkTarget = {
    id: PUSH_DEEP_LINK_LATEST_KEY,
    targetPath,
    createdAt: options.createdAt ?? Date.now()
  }

  await Promise.allSettled([
    writeIndexedDbRecord(PUSH_DEEP_LINK_LATEST_KEY, record),
    writeCachedJson(PUSH_DEEP_LINK_CACHE_TARGET_PATH, record)
  ])

  return targetPath
}

export const clearPendingPushDeepLinkTarget = async () => {
  await Promise.allSettled([
    deleteIndexedDbRecord(PUSH_DEEP_LINK_LATEST_KEY),
    deleteCachedJson(PUSH_DEEP_LINK_CACHE_TARGET_PATH)
  ])
}

export const consumePendingPushDeepLinkTarget = async (
  options: ConsumePendingPushDeepLinkOptions = {}
) => {
  let record = await readIndexedDbRecord<PendingPushDeepLinkTarget>(PUSH_DEEP_LINK_LATEST_KEY)
    .catch(() => null)

  if (!record) {
    record = await readCachedJson<PendingPushDeepLinkTarget>(PUSH_DEEP_LINK_CACHE_TARGET_PATH)
      .catch(() => null)
  }

  await clearPendingPushDeepLinkTarget()

  if (!record) return null

  const now = options.now ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_PENDING_PUSH_DEEP_LINK_MAX_AGE_MS
  const createdAt = parseRecordCreatedAt(record.createdAt)

  if (createdAt === null || now - createdAt > maxAgeMs) {
    return DEFAULT_PUSH_DEEP_LINK_TARGET
  }

  return normalizePushDeepLinkTarget(record.targetPath)
}

export const readPushDeepLinkDiagnostics = async () => {
  const indexedDbRecord = await readIndexedDbRecord<PushDeepLinkDiagnostics>(PUSH_DEEP_LINK_DIAGNOSTIC_KEY)
    .catch(() => null)

  if (indexedDbRecord) return indexedDbRecord

  return readCachedJson<PushDeepLinkDiagnostics>(PUSH_DEEP_LINK_CACHE_DIAGNOSTIC_PATH)
    .catch(() => null)
}
