import { afterEach, describe, expect, it, vi } from 'vitest'

const origin = 'https://example.com'

const getCacheKey = (request: RequestInfo | URL) => {
  if (typeof request === 'string') return request
  if (request instanceof URL) return request.href
  return request.url
}

const createFakeCaches = () => {
  const entries = new Map<string, string>()

  return {
    entries,
    open: vi.fn(async () => ({
      put: vi.fn(async (request: RequestInfo | URL, response: Response) => {
        entries.set(getCacheKey(request), await response.clone().text())
      }),
      match: vi.fn(async (request: RequestInfo | URL) => {
        const body = entries.get(getCacheKey(request))
        return body ? new Response(body) : undefined
      }),
      delete: vi.fn(async (request: RequestInfo | URL) => entries.delete(getCacheKey(request)))
    }))
  }
}

const createFakeIndexedDb = () => {
  const records = new Map<string, any>()
  const objectStoreNames = new Set<string>()

  const createRequest = <T>() => ({
    result: undefined as T | undefined,
    error: null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onupgradeneeded: null as (() => void) | null
  })

  const createTransaction = () => {
    let completed = false
    let oncomplete: (() => void) | null = null

    const notifyComplete = () => {
      setTimeout(() => {
        completed = true
        oncomplete?.()
      }, 0)
    }

    const transaction: any = {
      error: null,
      onerror: null,
      onabort: null,
      objectStore: () => ({
        get: (key: string) => {
          const request = createRequest<any>()
          setTimeout(() => {
            request.result = records.get(key)
            request.onsuccess?.()
            notifyComplete()
          }, 0)
          return request
        },
        put: (record: any) => {
          records.set(record.id, record)
          notifyComplete()
        },
        delete: (key: string) => {
          records.delete(key)
          notifyComplete()
        }
      })
    }

    Object.defineProperty(transaction, 'oncomplete', {
      get: () => oncomplete,
      set: (handler) => {
        oncomplete = handler
        if (completed) {
          setTimeout(() => oncomplete?.(), 0)
        }
      }
    })

    return transaction
  }

  const db: any = {
    objectStoreNames: {
      contains: (name: string) => objectStoreNames.has(name)
    },
    createObjectStore: (name: string) => {
      objectStoreNames.add(name)
      return {}
    },
    transaction: () => createTransaction()
  }

  return {
    open: () => {
      const request = createRequest<any>()
      setTimeout(() => {
        request.result = db
        if (!objectStoreNames.has('pendingTargets')) {
          request.onupgradeneeded?.()
        }
        request.onsuccess?.()
      }, 0)
      return request
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('pushDeepLink', () => {
  it('keeps safe same-origin app routes', async () => {
    const { normalizePushDeepLinkTarget } = await import('./pushDeepLink')

    expect(normalizePushDeepLinkTarget('/calendar?match_id=match-1', origin))
      .toBe('/calendar?match_id=match-1')
    expect(normalizePushDeepLinkTarget('training?session_id=session-1', origin))
      .toBe('/training?session_id=session-1')
  })

  it('converts legacy match detail targets to the schedule detail route', async () => {
    const { normalizePushDeepLinkTarget } = await import('./pushDeepLink')

    expect(normalizePushDeepLinkTarget('/match-records?match_id=match-1', origin))
      .toBe('/calendar?match_id=match-1')
    expect(normalizePushDeepLinkTarget('https://example.com/#/match-records?match_id=match-2', origin))
      .toBe('/calendar?match_id=match-2')
  })

  it('blocks unsafe or recursive push entry targets', async () => {
    const {
      DEFAULT_PUSH_DEEP_LINK_TARGET,
      normalizePushDeepLinkTarget
    } = await import('./pushDeepLink')

    expect(normalizePushDeepLinkTarget('https://evil.example/calendar', origin))
      .toBe(DEFAULT_PUSH_DEEP_LINK_TARGET)
    expect(normalizePushDeepLinkTarget('//evil.example/calendar', origin))
      .toBe(DEFAULT_PUSH_DEEP_LINK_TARGET)
    expect(normalizePushDeepLinkTarget('/push-entry?target=/calendar', origin))
      .toBe(DEFAULT_PUSH_DEEP_LINK_TARGET)
  })

  it('builds the hash entry used after reading push_target', async () => {
    const { buildPushEntryHash } = await import('./pushDeepLink')

    expect(buildPushEntryHash('/calendar?match_id=match-1'))
      .toBe('#/push-entry?target=%2Fcalendar%3Fmatch_id%3Dmatch-1')
  })

  it('saves pending push targets and clears them after consuming', async () => {
    const fakeCaches = createFakeCaches()
    vi.stubGlobal('indexedDB', createFakeIndexedDb())
    vi.stubGlobal('caches', fakeCaches)
    const {
      consumePendingPushDeepLinkTarget,
      savePendingPushDeepLinkTarget
    } = await import('./pushDeepLink')

    await savePendingPushDeepLinkTarget('/match-records?match_id=match-1', { createdAt: 1_000 })

    await expect(consumePendingPushDeepLinkTarget({ now: 2_000 }))
      .resolves.toBe('/calendar?match_id=match-1')
    await expect(consumePendingPushDeepLinkTarget({ now: 2_000 }))
      .resolves.toBeNull()
    expect(fakeCaches.entries.size).toBe(0)
  })

  it('uses Cache Storage pending targets when IndexedDB is unavailable', async () => {
    vi.stubGlobal('caches', createFakeCaches())
    const {
      consumePendingPushDeepLinkTarget,
      savePendingPushDeepLinkTarget
    } = await import('./pushDeepLink')

    await savePendingPushDeepLinkTarget('/match-records?match_id=match-1', { createdAt: 1_000 })

    await expect(consumePendingPushDeepLinkTarget({ now: 2_000 }))
      .resolves.toBe('/calendar?match_id=match-1')
    await expect(consumePendingPushDeepLinkTarget({ now: 2_000 }))
      .resolves.toBeNull()
  })

  it('falls back to the dashboard for stale pending targets', async () => {
    const fakeCaches = createFakeCaches()
    vi.stubGlobal('indexedDB', createFakeIndexedDb())
    vi.stubGlobal('caches', fakeCaches)
    const {
      DEFAULT_PUSH_DEEP_LINK_TARGET,
      consumePendingPushDeepLinkTarget,
      savePendingPushDeepLinkTarget
    } = await import('./pushDeepLink')

    await savePendingPushDeepLinkTarget('/calendar?match_id=match-1', { createdAt: 1_000 })

    await expect(consumePendingPushDeepLinkTarget({ maxAgeMs: 500, now: 2_000 }))
      .resolves.toBe(DEFAULT_PUSH_DEEP_LINK_TARGET)
    expect(fakeCaches.entries.size).toBe(0)
  })

  it('falls back to the dashboard for invalid pending targets', async () => {
    vi.stubGlobal('indexedDB', createFakeIndexedDb())
    const {
      DEFAULT_PUSH_DEEP_LINK_TARGET,
      consumePendingPushDeepLinkTarget,
      savePendingPushDeepLinkTarget
    } = await import('./pushDeepLink')

    await savePendingPushDeepLinkTarget('https://evil.example/calendar', { createdAt: 1_000 })

    await expect(consumePendingPushDeepLinkTarget({ now: 2_000 }))
      .resolves.toBe(DEFAULT_PUSH_DEEP_LINK_TARGET)
  })

  it('reads the latest push click diagnostics from Cache Storage', async () => {
    const fakeCaches = createFakeCaches()
    vi.stubGlobal('caches', fakeCaches)
    const {
      PUSH_DEEP_LINK_CACHE_DIAGNOSTIC_PATH,
      readPushDeepLinkDiagnostics
    } = await import('./pushDeepLink')

    const cache = await fakeCaches.open()
    await cache.put(
      new Request(new URL(PUSH_DEEP_LINK_CACHE_DIAGNOSTIC_PATH, 'https://jg-baseball.local').href),
      new Response(JSON.stringify({
        source: 'notificationclick',
        targetPath: '/calendar?match_id=match-1',
        createdAt: 1_000,
        indexedDb: 'failed',
        cache: 'saved'
      }))
    )

    await expect(readPushDeepLinkDiagnostics()).resolves.toMatchObject({
      source: 'notificationclick',
      targetPath: '/calendar?match_id=match-1',
      indexedDb: 'failed',
      cache: 'saved'
    })
  })
})
