// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const authStoreMock = vi.hoisted(() => ({
  isInitializing: false,
  isAuthenticated: false,
  profile: null as null | { linked_team_member_ids?: string[] | null; role?: string; is_active?: boolean; access_start?: string; access_end?: string },
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

vi.mock('../layouts/PublicLayout.vue', () => ({
  default: { template: '<router-view />' }
}))

vi.mock('../layouts/MainLayout.vue', () => ({
  default: { template: '<router-view />' }
}))

vi.mock('../views/PushEntryView.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('../views/LandingView.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('../views/HomeView.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('../views/CoachLeaveRequestsView.vue', () => ({
  default: { template: '<div />' }
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
    expect(routes.find((route) => route.path === '/my-coach-leave-requests')?.meta.feature).toBe('my_coach_leave_requests')
    expect(routes.find((route) => route.path === '/coach-leave-requests')?.meta.feature).toBe('coach_leave_requests')
    expect(routes.find((route) => route.path === '/equipment')?.meta.feature).toBe('equipment')
    expect(routes.find((route) => route.path === '/equipment-purchases')?.meta.feature).toBe('fees')
    expect(routes.find((route) => route.path === '/vendors')?.meta.feature).toBe('vendors')
    expect(routes.find((route) => route.path === '/registration-forms')?.meta.feature).toBe('registration_forms')
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

  it('allows an active coach with own leave VIEW and blocks non-coach ADMIN despite bypass permissions', async () => {
    authStoreMock.isAuthenticated = true
    authStoreMock.profile = { role: ' COACH ', is_active: true }
    permissionsStoreMock.can.mockImplementation((feature) => feature === 'my_coach_leave_requests')
    const router = (await import('./index')).default
    await router.push('/my-coach-leave-requests')
    expect(router.currentRoute.value.path).toBe('/my-coach-leave-requests')

    authStoreMock.profile = { role: 'ADMIN', is_active: true }
    permissionsStoreMock.can.mockReturnValue(true)
    await router.push('/dashboard')
    await router.push('/my-coach-leave-requests')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('blocks expired coaches and does not let own leave permissions grant management access', async () => {
    authStoreMock.isAuthenticated = true
    authStoreMock.profile = { role: 'COACH', access_end: '2000-01-01T00:00:00Z' }
    permissionsStoreMock.can.mockReturnValue(true)
    const router = (await import('./index')).default
    await router.push('/my-coach-leave-requests')
    expect(router.currentRoute.value.path).toBe('/dashboard')

    authStoreMock.profile = { role: 'COACH', is_active: true }
    permissionsStoreMock.can.mockImplementation((feature) => feature === 'my_coach_leave_requests')
    await router.push('/coach-leave-requests')
    expect(router.currentRoute.value.path).toBe('/dashboard')
  })

  it('allows delegated management VIEW without requiring the actor to be a coach', async () => {
    authStoreMock.isAuthenticated = true
    authStoreMock.profile = { role: 'MANAGER', is_active: true }
    permissionsStoreMock.can.mockImplementation((feature) => feature === 'coach_leave_requests')
    const router = (await import('./index')).default
    await router.push('/coach-leave-requests?highlight_leave_id=leave-1')
    expect(router.currentRoute.value.path).toBe('/coach-leave-requests')
  })
})
