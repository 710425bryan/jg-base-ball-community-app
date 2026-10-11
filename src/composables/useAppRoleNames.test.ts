import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, type EffectScope } from 'vue'
import { useAppRoleNames } from './useAppRoleNames'

const state = vi.hoisted(() => ({ auth: null as any, permissions: null as any }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => state.permissions }))

const scopes: EffectScope[] = []
const start = () => {
  const scope = effectScope()
  scopes.push(scope)
  scope.run(useAppRoleNames)
}

beforeEach(() => {
  state.auth = reactive({ isAuthenticated: false, user: null, profile: null })
  state.permissions = reactive({ roles: [], fetchRoles: vi.fn().mockResolvedValue(undefined) })
})

afterEach(async () => {
  scopes.splice(0).forEach((scope) => scope.stop())
  await Promise.resolve()
})

describe('useAppRoleNames', () => {
  it('does not query roles anonymously or for a mismatched user/profile, then loads after login', async () => {
    start()
    expect(state.permissions.fetchRoles).not.toHaveBeenCalled()
    Object.assign(state.auth, { isAuthenticated: true, user: { id: 'user-1' }, profile: { id: 'old-user' } })
    await nextTick()
    expect(state.permissions.fetchRoles).not.toHaveBeenCalled()
    state.auth.profile = { id: 'user-1' }
    await nextTick()
    expect(state.permissions.fetchRoles).toHaveBeenCalledOnce()
    Object.assign(state.auth, { isAuthenticated: false, user: null, profile: null })
    await nextTick()
    expect(state.permissions.fetchRoles).toHaveBeenCalledOnce()
  })

  it('uses already loaded metadata without querying or affecting permission state', () => {
    Object.assign(state.auth, { isAuthenticated: true, user: { id: 'user-1' }, profile: { id: 'user-1' } })
    state.permissions.roles = [{ role_key: 'ADMIN', role_name: '管理團隊' }]
    start()
    expect(state.permissions.fetchRoles).not.toHaveBeenCalled()
    expect(state.permissions.roles).toEqual([{ role_key: 'ADMIN', role_name: '管理團隊' }])
  })

  it('shares an in-flight load while switching between public and authenticated layouts', async () => {
    let finish!: () => void
    state.permissions.fetchRoles.mockReturnValue(new Promise<void>((resolve) => { finish = resolve }))
    Object.assign(state.auth, { isAuthenticated: true, user: { id: 'user-2' }, profile: { id: 'user-2' } })
    start()
    start()
    expect(state.permissions.fetchRoles).toHaveBeenCalledOnce()
    finish()
    await Promise.resolve()
  })
})
