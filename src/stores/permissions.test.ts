import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const eqMock = vi.fn()
const permissionsSelectMock = vi.fn(() => ({ eq: eqMock }))
const orderMock = vi.fn()
const rolesSelectMock = vi.fn(() => ({ order: orderMock }))
const fromMock = vi.fn((table: string) => {
  if (table === 'app_role_permissions') return { select: permissionsSelectMock }
  if (table === 'app_roles') return { select: rolesSelectMock }
  throw new Error(`Unexpected table: ${table}`)
})

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: fromMock
  }
}))

describe('permissions store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('loads permissions for a role and checks feature actions', async () => {
    eqMock.mockResolvedValue({
      data: [{ feature: 'equipment', action: 'VIEW' }],
      error: null
    })

    const { usePermissionsStore } = await import('./permissions')
    const store = usePermissionsStore()

    await store.fetchPermissions('COACH')

    expect(eqMock).toHaveBeenCalledWith('role_key', 'COACH')
    expect(store.can('equipment', 'VIEW')).toBe(true)
    expect(store.can('equipment', 'EDIT')).toBe(false)
    expect(store.can('dashboard', 'VIEW')).toBe(true)
    expect(store.can('calendar', 'VIEW')).toBe(true)
    expect(store.can('matches', 'VIEW')).toBe(true)
  })

  it('bypasses permissions for ADMIN and clears permissions for blank role', async () => {
    const { usePermissionsStore } = await import('./permissions')
    const store = usePermissionsStore()

    await store.fetchPermissions('')
    expect(store.permissions).toEqual([])
    expect(store.currentRole).toBe('')

    store.currentRole = 'ADMIN'
    expect(store.can('anything', 'DELETE')).toBe(true)
  })

  it('loads roles ordered by weight', async () => {
    orderMock.mockResolvedValue({
      data: [{ role_key: 'ADMIN' }],
      error: null
    })

    const { usePermissionsStore } = await import('./permissions')
    const store = usePermissionsStore()

    await store.fetchRoles()

    expect(orderMock).toHaveBeenCalledWith('weight', { ascending: true })
    expect(store.roles).toEqual([{ role_key: 'ADMIN' }])
  })
})
