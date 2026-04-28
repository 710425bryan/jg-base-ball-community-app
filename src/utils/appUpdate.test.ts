// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildAppReloadUrl,
  getCurrentRouteFullPathFromLocation,
  normalizeRouteFullPath
} from './appUpdate'

describe('app update reload helpers', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#/')
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
})
