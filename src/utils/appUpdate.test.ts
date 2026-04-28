// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAppReloadUrl,
  getCurrentRouteFullPathFromLocation,
  normalizeRouteFullPath,
  refreshAppShell
} from './appUpdate'

type MockServiceWorker = ServiceWorker & {
  setState: (state: ServiceWorkerState) => void
}

type MockServiceWorkerRegistration = ServiceWorkerRegistration & {
  setInstalling: (worker: MockServiceWorker | null) => void
  setWaiting: (worker: MockServiceWorker | null) => void
}

type MockServiceWorkerContainer = ServiceWorkerContainer & {
  dispatchControllerChange: () => void
  getRegistrations: ReturnType<typeof vi.fn>
}

const callEventListener = (
  listener: EventListenerOrEventListenerObject,
  event: Event
) => {
  if (typeof listener === 'function') {
    listener(event)
    return
  }

  listener.handleEvent(event)
}

const createMockWorker = (
  initialState: ServiceWorkerState = 'installed',
  onPostMessage?: () => void
) => {
  let state = initialState
  const stateChangeListeners = new Set<EventListenerOrEventListenerObject>()
  const worker = {
    get state() {
      return state
    },
    postMessage: vi.fn(() => {
      onPostMessage?.()
    }),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'statechange') {
        stateChangeListeners.add(listener)
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'statechange') {
        stateChangeListeners.delete(listener)
      }
    }),
    setState(nextState: ServiceWorkerState) {
      state = nextState
      const event = new Event('statechange')
      stateChangeListeners.forEach((listener) => callEventListener(listener, event))
    }
  }

  return worker as unknown as MockServiceWorker
}

const createMockRegistration = () => {
  let installing: MockServiceWorker | null = null
  let waiting: MockServiceWorker | null = null
  const registration = {
    get installing() {
      return installing
    },
    get waiting() {
      return waiting
    },
    update: vi.fn(async () => registration),
    setInstalling(worker: MockServiceWorker | null) {
      installing = worker
    },
    setWaiting(worker: MockServiceWorker | null) {
      waiting = worker
    }
  }

  return registration as unknown as MockServiceWorkerRegistration
}

const createMockServiceWorkerContainer = () => {
  const controllerChangeListeners = new Set<EventListenerOrEventListenerObject>()
  const serviceWorker = {
    getRegistrations: vi.fn(),
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'controllerchange') {
        controllerChangeListeners.add(listener)
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'controllerchange') {
        controllerChangeListeners.delete(listener)
      }
    }),
    dispatchControllerChange() {
      const event = new Event('controllerchange')
      controllerChangeListeners.forEach((listener) => callEventListener(listener, event))
    }
  }

  return serviceWorker as unknown as MockServiceWorkerContainer
}

const setServiceWorkerMock = (serviceWorker: MockServiceWorkerContainer) => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: serviceWorker
  })
}

const removeServiceWorkerMock = () => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
}

const expectAppReloadScheduledOnce = () => {
  const setTimeoutMock = window.setTimeout as unknown as {
    mock: { calls: Array<[TimerHandler, number | undefined, ...unknown[]]> }
  }
  const reloadTimerCalls = setTimeoutMock.mock.calls.filter((call) =>
    call[1] === 0 && String(call[0]).includes('location.reload')
  )

  expect(reloadTimerCalls).toHaveLength(1)
}

describe('app update reload helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(window, 'setTimeout')
    window.history.replaceState(null, '', '/#/')
    removeServiceWorkerMock()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    removeServiceWorkerMock()
  })

  it('normalizes hash and route paths for hash history', () => {
    expect(normalizeRouteFullPath('#/dashboard')).toBe('/dashboard')
    expect(normalizeRouteFullPath('profile')).toBe('/profile')
    expect(normalizeRouteFullPath('')).toBe('/dashboard')
  })

  it('reads the current full route from the URL hash', () => {
    window.history.replaceState(null, '', '/#/my-payments?view=equipment')

    expect(getCurrentRouteFullPathFromLocation()).toBe('/my-payments?view=equipment')
  })

  it('adds a cache-busting query while preserving the target hash route', () => {
    window.history.replaceState(null, '', '/?source=pwa#/')

    const reloadUrl = new URL(buildAppReloadUrl('/dashboard'))
    const routeUrl = new URL(reloadUrl.hash.slice(1), window.location.origin)

    expect(reloadUrl.pathname).toBe('/')
    expect(reloadUrl.searchParams.get('source')).toBe('pwa')
    expect(reloadUrl.searchParams.get('app_reload')).toBeNull()
    expect(routeUrl.pathname).toBe('/dashboard')
    expect(routeUrl.searchParams.get('app_reload')).toBeTruthy()
  })

  it('preserves existing route query params when adding the reload marker', () => {
    const reloadUrl = new URL(buildAppReloadUrl('/my-payments?view=equipment'))
    const routeUrl = new URL(reloadUrl.hash.slice(1), window.location.origin)

    expect(routeUrl.pathname).toBe('/my-payments')
    expect(routeUrl.searchParams.get('view')).toBe('equipment')
    expect(routeUrl.searchParams.get('app_reload')).toBeTruthy()
  })

  it('falls back to one app shell reload when service workers are unavailable', async () => {
    await refreshAppShell('/dashboard')

    const routeUrl = new URL(window.location.hash.slice(1), window.location.origin)
    expect(routeUrl.pathname).toBe('/dashboard')
    expect(routeUrl.searchParams.get('app_reload')).toBeTruthy()
    expectAppReloadScheduledOnce()
  })

  it('activates one waiting service worker and reloads once at the end', async () => {
    const serviceWorker = createMockServiceWorkerContainer()
    const registration = createMockRegistration()
    const waitingWorker = createMockWorker('installed', () => {
      registration.setWaiting(null)
      serviceWorker.dispatchControllerChange()
    })

    registration.setWaiting(waitingWorker)
    serviceWorker.getRegistrations.mockResolvedValue([registration])
    setServiceWorkerMock(serviceWorker)

    await refreshAppShell('/dashboard')

    expect(registration.update).toHaveBeenCalledTimes(2)
    expect(waitingWorker.postMessage).toHaveBeenCalledTimes(1)
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expectAppReloadScheduledOnce()
  })

  it('keeps applying queued service worker versions before reloading once', async () => {
    const serviceWorker = createMockServiceWorkerContainer()
    const registration = createMockRegistration()
    const secondVersionWorker = createMockWorker('installed', () => {
      registration.setWaiting(thirdVersionWorker)
      serviceWorker.dispatchControllerChange()
    })
    const thirdVersionWorker = createMockWorker('installed', () => {
      registration.setWaiting(null)
      serviceWorker.dispatchControllerChange()
    })

    registration.setWaiting(secondVersionWorker)
    serviceWorker.getRegistrations.mockResolvedValue([registration])
    setServiceWorkerMock(serviceWorker)

    await refreshAppShell('/dashboard')

    expect(registration.update).toHaveBeenCalledTimes(3)
    expect(secondVersionWorker.postMessage).toHaveBeenCalledTimes(1)
    expect(thirdVersionWorker.postMessage).toHaveBeenCalledTimes(1)
    expectAppReloadScheduledOnce()
  })

  it('falls back to one reload when service worker activation fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const serviceWorker = createMockServiceWorkerContainer()
    const registration = createMockRegistration()
    const waitingWorker = createMockWorker('installed', () => {
      throw new Error('postMessage failed')
    })

    registration.setWaiting(waitingWorker)
    serviceWorker.getRegistrations.mockResolvedValue([registration])
    setServiceWorkerMock(serviceWorker)

    await refreshAppShell('/dashboard')

    expect(waitingWorker.postMessage).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      '[AppUpdate] Failed to activate waiting service worker',
      expect.any(Error)
    )
    expectAppReloadScheduledOnce()
  })
})
