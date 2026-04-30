export const DEFAULT_PUSH_DEEP_LINK_TARGET = '/dashboard'
export const PUSH_ENTRY_ROUTE = '/push-entry'
export const PUSH_NOTIFICATION_CLICK_MESSAGE = 'PUSH_NOTIFICATION_CLICK'
export const PUSH_DEEP_LINK_DB_NAME = 'jg-baseball-push-deeplink'
export const PUSH_DEEP_LINK_DB_VERSION = 1
export const PUSH_DEEP_LINK_STORE = 'pendingTargets'
export const PUSH_DEEP_LINK_LATEST_KEY = 'latest'
export const DEFAULT_PENDING_PUSH_DEEP_LINK_MAX_AGE_MS = 10 * 60 * 1000

export type PendingPushDeepLinkTarget = {
  id: string
  targetPath: string
  createdAt: number
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

export const savePendingPushDeepLinkTarget = async (
  rawTarget: unknown,
  options: { createdAt?: number } = {}
) => {
  const targetPath = normalizePushDeepLinkTarget(rawTarget)
  const db = await openPushDeepLinkDb()
  const transaction = db.transaction(PUSH_DEEP_LINK_STORE, 'readwrite')
  const record: PendingPushDeepLinkTarget = {
    id: PUSH_DEEP_LINK_LATEST_KEY,
    targetPath,
    createdAt: options.createdAt ?? Date.now()
  }

  transaction.objectStore(PUSH_DEEP_LINK_STORE).put(record)
  await transactionDone(transaction)

  return targetPath
}

export const consumePendingPushDeepLinkTarget = async (
  options: ConsumePendingPushDeepLinkOptions = {}
) => {
  const db = await openPushDeepLinkDb()
  const transaction = db.transaction(PUSH_DEEP_LINK_STORE, 'readwrite')
  const store = transaction.objectStore(PUSH_DEEP_LINK_STORE)
  const record = await requestToPromise(store.get(PUSH_DEEP_LINK_LATEST_KEY)) as
    | PendingPushDeepLinkTarget
    | undefined

  if (!record) {
    await transactionDone(transaction)
    return null
  }

  store.delete(PUSH_DEEP_LINK_LATEST_KEY)
  await transactionDone(transaction)

  const now = options.now ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_PENDING_PUSH_DEEP_LINK_MAX_AGE_MS
  const createdAt = parseRecordCreatedAt(record.createdAt)

  if (createdAt === null || now - createdAt > maxAgeMs) {
    return DEFAULT_PUSH_DEEP_LINK_TARGET
  }

  return normalizePushDeepLinkTarget(record.targetPath)
}
