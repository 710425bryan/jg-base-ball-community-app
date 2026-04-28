// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getCurrentRouteFullPathFromLocationMock = vi.fn()
const refreshAppShellMock = vi.fn()

vi.mock('@/utils/appUpdate', () => ({
  getCurrentRouteFullPathFromLocation: getCurrentRouteFullPathFromLocationMock,
  refreshAppShell: refreshAppShellMock
}))

describe('useVersionCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetModules()
    getCurrentRouteFullPathFromLocationMock.mockReturnValue('/dashboard?foo=bar&dev_update=1&dev_update_version=local')
    refreshAppShellMock.mockResolvedValue(undefined)
    window.history.replaceState(null, '', '/?dev_update=1#/dashboard?foo=bar&dev_update_version=local')
    window.localStorage.setItem('jg-baseball-dev-update-version', 'local')
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('clears local development update markers when applying an update', async () => {
    const { useVersionCheck } = await import('./useVersionCheck')
    const { refreshApp } = useVersionCheck()

    await refreshApp()

    expect(refreshAppShellMock).toHaveBeenCalledWith('/dashboard?foo=bar')
    expect(window.localStorage.getItem('jg-baseball-dev-update-version')).toBeNull()
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/dashboard?foo=bar')
  })

  it('dismisses local development version mismatches after applying an update', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '9.9.9' })
    }))

    vi.stubGlobal('fetch', fetchMock)
    getCurrentRouteFullPathFromLocationMock.mockReturnValue('/my-payments?app_reload=moilslbk')
    window.history.replaceState(null, '', '/#/my-payments?app_reload=moilslbk')
    window.localStorage.removeItem('jg-baseball-dev-update-version')

    const { useVersionCheck } = await import('./useVersionCheck')
    const versionCheck = useVersionCheck()

    await vi.advanceTimersByTimeAsync(1000)

    expect(versionCheck.hasUpdateAvailable.value).toBe(true)

    await versionCheck.refreshApp()

    expect(window.localStorage.getItem('jg-baseball-dev-dismissed-update-version')).toBe('9.9.9')

    vi.clearAllTimers()
    vi.resetModules()

    const { useVersionCheck: useVersionCheckAfterReload } = await import('./useVersionCheck')
    const versionCheckAfterReload = useVersionCheckAfterReload()

    await vi.advanceTimersByTimeAsync(1000)

    expect(versionCheckAfterReload.hasUpdateAvailable.value).toBe(false)
  })

  it('dismisses the latest local version mismatch even before polling stores it', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '9.9.10' })
    }))

    vi.stubGlobal('fetch', fetchMock)
    getCurrentRouteFullPathFromLocationMock.mockReturnValue('/my-payments?app_reload=moilslbk')
    window.history.replaceState(null, '', '/#/my-payments?app_reload=moilslbk')
    window.localStorage.removeItem('jg-baseball-dev-update-version')

    const { useVersionCheck } = await import('./useVersionCheck')
    const { refreshApp } = useVersionCheck()

    await refreshApp()

    expect(window.localStorage.getItem('jg-baseball-dev-dismissed-update-version')).toBe('9.9.10')
    expect(refreshAppShellMock).toHaveBeenCalledWith('/my-payments?app_reload=moilslbk')
  })
})
