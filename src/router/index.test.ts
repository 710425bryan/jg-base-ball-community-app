// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const authStoreMock = vi.hoisted(() => ({
  isInitializing: false,
  isAuthenticated: false,
  profile: null as null | { linked_team_member_ids?: string[] | null },
  ensureInitialized: vi.fn()
}))
const permissionsStoreMock = vi.hoisted(() => ({
  can: vi.fn(() => false)
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreMock
}))

vi.mock('@/stores/permissions', () => ({
  usePermissionsStore: () => permissionsStoreMock
}))

describe('router route and guard coverage', () => {
  beforeEach(() => {
    authStoreMock.isInitializing = false
    authStoreMock.isAuthenticated = false
    authStoreMock.profile = null
    authStoreMock.ensureInitialized.mockReset()
    permissionsStoreMock.can.mockReset()
    permissionsStoreMock.can.mockReturnValue(false)
  })

  it('keeps public and authenticated route boundaries explicit', async () => {
    const router = (await import('./index')).default
    const routes = router.getRoutes()

    expect(routes.some((route) => route.path === '/' && route.name === 'Landing')).toBe(true)
    expect(routes.some((route) => route.path === '/push-entry' && route.name === 'PushEntry')).toBe(true)

    const dashboardRoute = routes.find((route) => route.path === '/dashboard')
    expect(dashboardRoute?.name).toBe('Dashboard')
  })

  it('keeps feature metadata on protected admin routes', async () => {
    const router = (await import('./index')).default
    const routes = router.getRoutes()

    expect(routes.find((route) => route.path === '/training')?.meta.feature).toBe('training')
    expect(routes.find((route) => route.path === '/training-dates')?.meta.feature).toBe('training_dates')
    expect(routes.find((route) => route.path === '/training-locations')?.meta.feature).toBe('training_locations')
    expect(routes.find((route) => route.path === '/coach-schedules')?.meta.feature).toBe('coach_schedules')
    expect(routes.find((route) => route.path === '/equipment')?.meta.feature).toBe('equipment')
    expect(routes.find((route) => route.path === '/vendors')?.meta.feature).toBe('vendors')
  })

  it('redirects unauthenticated users away from authenticated routes', async () => {
    const router = (await import('./index')).default

    await router.push('/dashboard')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('allows linked member access for performance detail features', async () => {
    authStoreMock.isAuthenticated = true
    authStoreMock.profile = {
      linked_team_member_ids: ['member-1']
    }

    const router = (await import('./index')).default

    await router.push('/baseball-ability/member-1')
    await router.isReady()

    expect(router.currentRoute.value.path).toBe('/baseball-ability/member-1')
  })
})
