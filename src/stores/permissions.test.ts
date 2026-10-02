import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mocks = vi.hoisted(() => ({ order: vi.fn(), eq: vi.fn() }))
vi.mock('@/services/supabase', () => ({ supabase: { from: () => ({ select: () => ({ order: mocks.order, eq: mocks.eq }) }) } }))
import { usePermissionsStore } from './permissions'

describe('permissions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.eq.mockResolvedValue({ data: [], error: null })
  })

  it('loads permissions for a role and checks feature actions', async () => {
    mocks.eq.mockResolvedValue({ data: [{ feature: 'equipment', action: 'VIEW' }], error: null })
    const store = usePermissionsStore()
    await store.fetchPermissions('COACH')
    expect(mocks.eq).toHaveBeenCalledWith('role_key', 'COACH')
    expect(store.can('equipment', 'VIEW')).toBe(true)
    expect(store.can('equipment', 'EDIT')).toBe(false)
    expect(store.can('dashboard', 'VIEW')).toBe(true)
    expect(store.can('calendar', 'VIEW')).toBe(true)
    expect(store.can('matches', 'VIEW')).toBe(true)
  })

  it('bypasses permissions for ADMIN and clears permissions for a blank role', async () => {
    const store = usePermissionsStore()
    store.currentRole = 'COACH'
    store.permissions = [{ feature: 'equipment', action: 'VIEW' }]
    await store.fetchPermissions('')
    expect(store.permissions).toEqual([])
    expect(store.currentRole).toBe('')
    store.currentRole = 'ADMIN'
    expect(store.can('anything', 'DELETE')).toBe(true)
  })

  it('sorts fetched roles by weight then key, and refreshes order after an edit', async () => {
    const store = usePermissionsStore()
    const rows = [{ role_key: 'FINANCE', weight: 20 }, { role_key: 'COACH', weight: 16 }, { role_key: 'ADMIN', weight: 1 }]
    mocks.order.mockResolvedValue({ data: rows, error: null })
    await store.fetchRoles()
    expect(mocks.order).toHaveBeenCalledWith('weight', { ascending: true })
    expect(store.roles.map((role) => role.role_key)).toEqual(['ADMIN', 'COACH', 'FINANCE'])
    mocks.order.mockResolvedValue({ data: [{ role_key: 'FINANCE', weight: 5 }, ...rows.slice(1)], error: null })
    await store.fetchRoles()
    expect(store.roles.map((role) => role.role_key)).toEqual(['ADMIN', 'FINANCE', 'COACH'])
    expect(rows[0]?.weight).toBe(20)
  })

  it('keeps equal weights deterministic and handles a null weight as 99', async () => {
    mocks.order.mockResolvedValue({ data: [{ role_key: 'Z', weight: null }, { role_key: 'B', weight: 9 }, { role_key: 'A', weight: 9 }], error: null })
    const store = usePermissionsStore()
    await store.fetchRoles()
    expect(store.roles.map((role) => role.role_key)).toEqual(['A', 'B', 'Z'])
  })

  it('preserves the last loaded roles if a refresh fails', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = usePermissionsStore()
    store.roles = [{ role_key: 'ADMIN', weight: 1 }]
    mocks.order.mockResolvedValue({ data: null, error: { message: 'failed' } })
    await store.fetchRoles()
    expect(store.roles).toEqual([{ role_key: 'ADMIN', weight: 1 }])
    warning.mockRestore()
  })

  it('does not turn a smaller sort number into a permission grant', async () => {
    const store = usePermissionsStore()
    mocks.eq.mockResolvedValue({ data: [{ feature: 'players', action: 'VIEW' }], error: null })
    await store.fetchPermissions('CUSTOM')
    store.roles = [{ role_key: 'CUSTOM', weight: 1 }, { role_key: 'ADMIN', weight: 99 }]
    expect(store.can('users', 'EDIT')).toBe(false)
    expect(store.can('players', 'VIEW')).toBe(true)
    await store.fetchPermissions('ADMIN')
    expect(store.can('users', 'EDIT')).toBe(true)
  })
})
