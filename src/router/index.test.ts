// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const authStoreMock = vi.hoisted(() => ({
  isInitializing: false,
  isAuthenticated: false,
  profile: null as null | { linked_team_member_ids?: string[] | null },
  ensureInitialized: vi.fn()
}))
const permissionsStoreMock = vi.hoisted(() => ({
  can: vi.fn<(feature: string, action: string) => boolean>(() => false)
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
    expect(routes.find((route) => route.path === '/equipment-purchases')?.meta.feature).toBe('fees')
    expect(routes.find((route) => route.path === '/vendors')?.meta.feature).toBe('vendors')
  })

  it('redirects legacy equipment fee links to the independent workspace', async () => {
    authStoreMock.isAuthenticated = true
    permissionsStoreMock.can.mockImplementation((feature, action) => feature === 'fees' && action === 'VIEW')
    const router = (await import('./index')).default

    await router.push('/fees?tab=equipment&highlight_id=request-1')
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('EquipmentPurchases')
    expect(router.currentRoute.value.query).toMatchObject({
      area: 'requests',
      status: 'action',
      record_type: 'request',
      record_id: 'request-1'
    })
  })

  it('keeps the independent workspace limited to fees visibility', async () => {
    authStoreMock.isAuthenticated = true
    permissionsStoreMock.can.mockImplementation((feature, action) => feature === 'equipment' && action === 'VIEW')
    const router = (await import('./index')).default

    await router.push('/equipment-purchases?area=requests&status=action')

    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('redirects unauthenticated users away from authenticated routes', async () => {
    const router = (await import('./index')).default

    await router.push('/calendar')
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
