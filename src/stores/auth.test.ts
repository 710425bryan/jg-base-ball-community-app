// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })

  return { promise, resolve }
}

const getSessionMock = vi.fn()
const onAuthStateChangeMock = vi.fn()
const signOutMock = vi.fn()
const signInWithOtpMock = vi.fn()
const verifyOtpMock = vi.fn()
const signInWithPasskeyMock = vi.fn()
const registerPasskeyMock = vi.fn()
const passkeyListMock = vi.fn()
const passkeyUpdateMock = vi.fn()
const passkeyDeleteMock = vi.fn()
const rpcMock = vi.fn()
const accessMonitorCheckMock = vi.fn()
const accessMonitorStopMock = vi.fn()
const accessMonitorMock = vi.fn((_id: string, _profile: unknown, _onDenied: (message: string) => void) => ({
  check: accessMonitorCheckMock, stop: accessMonitorStopMock
}))
vi.mock('@/services/profileAccessMonitor', () => ({ createProfileAccessMonitor: accessMonitorMock }))
const profileSingleMock = vi.fn()
const profileEqMock = vi.fn(() => ({
  single: profileSingleMock,
  maybeSingle: vi.fn()
}))
const profileSelectMock = vi.fn(() => ({
  eq: profileEqMock
}))
const permissionsEqMock = vi.fn()
const permissionsSelectMock = vi.fn(() => ({
  eq: permissionsEqMock
}))
const fromMock = vi.fn((table: string) => {
  if (table === 'profiles') {
    return {
      select: profileSelectMock
    }
  }

  if (table === 'app_role_permissions') {
    return {
      select: permissionsSelectMock
    }
  }

  throw new Error(`Unexpected table: ${table}`)
})

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signOut: signOutMock,
      signInWithOtp: signInWithOtpMock,
      verifyOtp: verifyOtpMock,
      signInWithPasskey: signInWithPasskeyMock,
      registerPasskey: registerPasskeyMock,
      passkey: {
        list: passkeyListMock,
        update: passkeyUpdateMock,
        delete: passkeyDeleteMock
      }
    },
    from: fromMock,
    rpc: rpcMock
  }
}))

describe('auth store initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    rpcMock.mockResolvedValue({ data: null, error: null })
    signOutMock.mockResolvedValue({ error: null })
    onAuthStateChangeMock.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn()
        }
      }
    })
    setActivePinia(createPinia())
  })
  afterEach(() => vi.restoreAllMocks())

  const initializeLastSeenSession = async () => {
    const session = { access_token: 'last-seen-token', user: { id: 'last-seen-user' } } as any
    let onAuthChange: (event: string, session: any) => void = () => {}
    getSessionMock.mockResolvedValue({ data: { session } })
    profileSingleMock.mockResolvedValue({ data: { id: session.user.id, role: 'MANAGER' }, error: null })
    permissionsEqMock.mockResolvedValue({ data: [], error: null })
    onAuthStateChangeMock.mockImplementation(callback => {
      onAuthChange = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    const { useAuthStore } = await import('@/stores/auth')
    const store = useAuthStore()
    await store.ensureInitialized()
    return { store, emit: () => onAuthChange('TOKEN_REFRESHED', session) }
  }

  it('shares one initialization promise and ignores the mirrored initial auth event', async () => {
    const session = {
      access_token: 'session-token',
      user: { id: 'user-1' }
    } as any

    const deferredSession = createDeferred<any>()
    let hasAuthStateCallback = false
    let authStateCallback: (event: string, newSession: any) => void = () => {
      throw new Error('Expected auth state callback to be registered')
    }

    getSessionMock.mockImplementation(() => deferredSession.promise)

    profileSingleMock.mockResolvedValue({
      data: {
        id: 'user-1',
        role: 'MANAGER',
        name: 'Manager User'
      },
      error: null
    })

    permissionsEqMock.mockResolvedValue({
      data: [
        { feature: 'dashboard', action: 'VIEW' },
        { feature: 'players', action: 'VIEW' }
      ],
      error: null
    })

    onAuthStateChangeMock.mockImplementation((callback) => {
      hasAuthStateCallback = true
      authStateCallback = callback
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn()
          }
        }
      }
    })

    const [{ useAuthStore }, { usePermissionsStore }] = await Promise.all([
      import('@/stores/auth'),
      import('@/stores/permissions')
    ])

    const authStore = useAuthStore()
    const permissionsStore = usePermissionsStore()
    const fetchPermissionsSpy = vi.spyOn(permissionsStore, 'fetchPermissions')

    const firstInitialization = authStore.ensureInitialized()
    const secondInitialization = authStore.ensureInitialized()

    expect(getSessionMock).toHaveBeenCalledTimes(1)

    deferredSession.resolve({
      data: {
        session
      }
    })

    await Promise.all([firstInitialization, secondInitialization])

    expect(profileSingleMock).toHaveBeenCalledTimes(1)
    expect(fetchPermissionsSpy).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('touch_profile_last_seen')
    expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1)

    expect(hasAuthStateCallback).toBe(true)
    authStateCallback('INITIAL_SESSION', session)
    await Promise.resolve()
    await Promise.resolve()

    expect(profileSingleMock).toHaveBeenCalledTimes(1)
    expect(fetchPermissionsSpy).toHaveBeenCalledTimes(1)
    expect(authStore.user?.id).toBe('user-1')
    expect(permissionsStore.currentRole).toBe('MANAGER')
  })

  it('uses can_request_magic_link rpc before sending the otp email', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'can_request_magic_link') {
        return Promise.resolve({
          data: true,
          error: null
        })
      }

      return Promise.resolve({
        data: null,
        error: null
      })
    })

    signInWithOtpMock.mockResolvedValue({
      data: null,
      error: null
    })

    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    await authStore.sendMagicLink(' Test@Example.com ')

    expect(rpcMock).toHaveBeenCalledWith('can_request_magic_link', {
      p_email: 'test@example.com'
    })
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: 'test@example.com',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin
      }
    })
  })

  it('signs out and clears local auth when an initialized profile is suspended', async () => {
    const session = {
      access_token: 'session-token',
      user: { id: 'user-1' }
    } as any

    getSessionMock.mockResolvedValue({
      data: {
        session
      }
    })

    profileSingleMock.mockResolvedValue({
      data: {
        id: 'user-1',
        role: 'MANAGER',
        name: 'Suspended User',
        is_active: false
      },
      error: null
    })

    const [{ useAuthStore }, { usePermissionsStore }] = await Promise.all([
      import('@/stores/auth'),
      import('@/stores/permissions')
    ])

    const authStore = useAuthStore()
    const permissionsStore = usePermissionsStore()
    permissionsStore.currentRole = 'MANAGER'

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await authStore.ensureInitialized()
    consoleErrorSpy.mockRestore()

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(authStore.user).toBeNull()
    expect(authStore.profile).toBeNull()
    expect(authStore.isAuthenticated).toBe(false)
    expect(permissionsStore.currentRole).toBe('')
  })

  it('removes a suspended session immediately, without waiting for sign-out, and ignores a late token event', async () => {
    const pendingSignOut = createDeferred<any>()
    signOutMock.mockReturnValueOnce(pendingSignOut.promise)
    const { store, emit } = await initializeLastSeenSession()
    const deny = accessMonitorMock.mock.calls.at(-1)![2] as (message: string) => void
    deny('此帳號已被停權，無法登入系統。')
    expect(store.isAuthenticated).toBe(false)
    expect(store.profile).toBeNull()
    expect(store.accessDeniedMessage).toBe('此帳號已被停權，無法登入系統。')
    expect(accessMonitorStopMock).toHaveBeenCalledOnce()
    emit()
    await flushPromises()
    expect(store.isAuthenticated).toBe(false)
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' })
    pendingSignOut.resolve({ error: null })
    await flushPromises()
  })

  it('does not revive an old session or clear a new login when an old profile fetch completes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const pendingProfile = createDeferred<any>()
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'old-user' } } } })
    profileSingleMock.mockReturnValueOnce(pendingProfile.promise)
    const { useAuthStore } = await import('@/stores/auth')
    const store = useAuthStore()
    const initialization = store.ensureInitialized()
    await flushPromises()
    await store.signOut()
    verifyOtpMock.mockResolvedValueOnce({ data: { session: { user: { id: 'new-user' } } }, error: null })
    profileSingleMock.mockResolvedValueOnce({ data: { id: 'new-user', role: 'PARENT', is_active: true }, error: null })
    await store.verifyOtpCode('new@example.com', '12345678')
    pendingProfile.resolve({ data: { id: 'old-user', role: 'ADMIN', is_active: true }, error: null })
    await initialization
    expect(store.isAuthenticated).toBe(true)
    expect(store.profile.id).toBe('new-user')
    expect(accessMonitorMock).toHaveBeenCalledOnce()
  })

  it('checks current access on token refresh and ignores callbacks from a previous session', async () => {
    const { store, emit } = await initializeLastSeenSession()
    const previousDeny = accessMonitorMock.mock.calls.at(-1)![2] as (message: string) => void
    emit()
    await flushPromises()
    expect(accessMonitorCheckMock).toHaveBeenCalledOnce()
    await store.signOut()
    await store.ensureInitialized()
    previousDeny('old suspension')
    expect(store.isAuthenticated).toBe(true)
    expect(store.accessDeniedMessage).toBe('')
    store.$dispose()
    expect(accessMonitorStopMock).toHaveBeenCalledTimes(2)
  })

  it.each([false, null, 'true', { allowed: true }])('never sends mail unless the preflight is explicitly true (%s)', async canRequest => {
    rpcMock.mockResolvedValue({ data: canRequest, error: null })
    const { useAuthStore } = await import('@/stores/auth')
    await expect(useAuthStore().sendMagicLink('suspended@example.com')).rejects.toThrow('已停權')
    expect(signInWithOtpMock).not.toHaveBeenCalled()
  })

  it('does not restore login or dismiss the notice when an OTP profile response arrives after suspension', async () => {
    const { store } = await initializeLastSeenSession()
    const deny = accessMonitorMock.mock.calls.at(-1)![2]
    const pendingProfile = createDeferred<any>()
    profileSingleMock.mockReturnValueOnce(pendingProfile.promise)
    verifyOtpMock.mockResolvedValueOnce({ data: { session: { user: { id: 'last-seen-user' } } }, error: null })
    const verification = store.verifyOtpCode('test@example.com', '12345678')
    const rejected = expect(verification).rejects.toThrow('已被停權')
    await flushPromises()
    deny('此帳號已被停權，無法登入系統。')
    pendingProfile.resolve({ data: { id: 'last-seen-user', is_active: true }, error: null })
    await rejected
    expect(store.isAuthenticated).toBe(false)
    expect(store.accessDeniedMessage).toContain('已被停權')
  })

  it('does not expose protected UI if a persisted session cannot load its profile', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'offline-user' } } } })
    profileSingleMock.mockResolvedValueOnce({ data: null, error: new Error('offline') })
    const { useAuthStore } = await import('@/stores/auth')
    const store = useAuthStore()
    await store.ensureInitialized()
    expect(store.isAuthenticated).toBe(false)
    expect(store.accessDeniedMessage).toBe('')
    expect(signOutMock).not.toHaveBeenCalled()
  })

  it('does not call Auth OTP when the preflight query fails, even with truthy data', async () => {
    rpcMock.mockResolvedValue({ data: true, error: new Error('network error') })
    const { useAuthStore } = await import('@/stores/auth')
    await expect(useAuthStore().sendMagicLink('test@example.com')).rejects.toThrow('未寄送驗證碼')
    expect(signInWithOtpMock).not.toHaveBeenCalled()
  })

  it('verifies formatted OTP input with the same normalized email used for sending', async () => {
    const session = { access_token: 'session-token', user: { id: 'otp-user' } }
    verifyOtpMock.mockResolvedValue({ data: { session }, error: null })
    profileSingleMock.mockResolvedValue({ data: { id: 'otp-user', role: 'MANAGER', is_active: true }, error: null })
    permissionsEqMock.mockResolvedValue({ data: [{ feature: 'players', action: 'VIEW' }], error: null })
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    await authStore.verifyOtpCode(' Test@Example.com ', ' ０１２３ ４５６７\n')

    expect(verifyOtpMock).toHaveBeenCalledWith({ email: 'test@example.com', token: '01234567', type: 'email' })
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.profile?.id).toBe('otp-user')
  })

  it('does not call Auth with malformed codes or accept verification without a session', async () => {
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()
    await expect(authStore.verifyOtpCode('test@example.com', '123456789')).rejects.toThrow('8 碼')
    expect(verifyOtpMock).not.toHaveBeenCalled()

    verifyOtpMock.mockResolvedValue({ data: { session: null }, error: null })
    await expect(authStore.verifyOtpCode('test@example.com', '12345678')).rejects.toThrow('登入未完成')
    expect(authStore.isAuthenticated).toBe(false)
    expect(profileSingleMock).not.toHaveBeenCalled()
  })

  it('rejects blocked emails before sending and preserves Auth verification errors', async () => {
    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()
    rpcMock.mockResolvedValue({ data: false, error: null })
    await expect(authStore.sendMagicLink('test@example.com')).rejects.toThrow('無法登入')
    expect(signInWithOtpMock).not.toHaveBeenCalled()

    const error = { code: 'otp_expired', message: 'Token has expired or is invalid' }
    verifyOtpMock.mockResolvedValue({ data: { session: null }, error })
    await expect(authStore.verifyOtpCode('test@example.com', '12345678')).rejects.toBe(error)
    expect(authStore.isAuthenticated).toBe(false)
    expect(profileSingleMock).not.toHaveBeenCalled()
  })

  it('rejects otp verification when the hydrated profile is outside the access window', async () => {
    const session = {
      access_token: 'session-token',
      user: { id: 'user-1' }
    } as any

    verifyOtpMock.mockResolvedValue({
      data: {
        session
      },
      error: null
    })

    profileSingleMock.mockResolvedValue({
      data: {
        id: 'user-1',
        role: 'MANAGER',
        name: 'Expired User',
        is_active: true,
        access_end: '2000-01-01T00:00:00.000Z'
      },
      error: null
    })

    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    await expect(authStore.verifyOtpCode('test@example.com', '12345678'))
      .rejects
      .toThrow('此帳號的可登入時間已結束。')

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(authStore.user).toBeNull()
    expect(authStore.profile).toBeNull()
    expect(authStore.isAuthenticated).toBe(false)
  })

  it('hydrates profile and permissions after passkey login succeeds', async () => {
    const session = {
      access_token: 'passkey-session-token',
      user: { id: 'user-passkey' }
    } as any

    signInWithPasskeyMock.mockResolvedValue({
      data: {
        session,
        user: session.user
      },
      error: null
    })

    profileSingleMock.mockResolvedValue({
      data: {
        id: 'user-passkey',
        role: 'COACH',
        name: 'Passkey User',
        is_active: true
      },
      error: null
    })

    permissionsEqMock.mockResolvedValue({
      data: [
        { feature: 'dashboard', action: 'VIEW' },
        { feature: 'players', action: 'VIEW' }
      ],
      error: null
    })

    const [{ useAuthStore }, { usePermissionsStore }] = await Promise.all([
      import('@/stores/auth'),
      import('@/stores/permissions')
    ])

    const authStore = useAuthStore()
    const permissionsStore = usePermissionsStore()

    await authStore.signInWithPasskey()

    expect(signInWithPasskeyMock).toHaveBeenCalledTimes(1)
    expect(profileSingleMock).toHaveBeenCalledTimes(1)
    expect(authStore.user?.id).toBe('user-passkey')
    expect(authStore.profile?.name).toBe('Passkey User')
    expect(permissionsStore.currentRole).toBe('COACH')
    expect(rpcMock).toHaveBeenCalledWith('touch_profile_last_seen')
  })

  it('rejects passkey login when the hydrated profile is outside the access window', async () => {
    const session = {
      access_token: 'passkey-session-token',
      user: { id: 'user-passkey' }
    } as any

    signInWithPasskeyMock.mockResolvedValue({
      data: {
        session,
        user: session.user
      },
      error: null
    })

    profileSingleMock.mockResolvedValue({
      data: {
        id: 'user-passkey',
        role: 'MANAGER',
        name: 'Expired Passkey User',
        is_active: true,
        access_end: '2000-01-01T00:00:00.000Z'
      },
      error: null
    })

    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    await expect(authStore.signInWithPasskey())
      .rejects
      .toThrow('此帳號的可登入時間已結束。')

    expect(signOutMock).toHaveBeenCalledTimes(1)
    expect(authStore.user).toBeNull()
    expect(authStore.profile).toBeNull()
    expect(authStore.isAuthenticated).toBe(false)
  })

  it('throws a clear error when the loaded Supabase client has no passkey namespace', async () => {
    const { supabase } = await import('@/services/supabase')
    const originalPasskey = (supabase.auth as any).passkey
    ;(supabase.auth as any).passkey = undefined

    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    expect(authStore.isPasskeyApiAvailable).toBe(false)
    await expect(authStore.listPasskeys())
      .rejects
      .toThrow('目前前端載入的 Supabase SDK 尚未提供 Passkey API')

    ;(supabase.auth as any).passkey = originalPasskey
  })

  it('wraps passkey registration and management api calls', async () => {
    registerPasskeyMock.mockResolvedValue({
      data: {
        id: 'registration-1'
      },
      error: null
    })
    passkeyListMock.mockResolvedValue({
      data: [
        {
          id: 'passkey-1',
          friendly_name: 'iPhone',
          created_at: '2026-05-01T00:00:00.000Z',
          last_used_at: '2026-05-02T00:00:00.000Z'
        }
      ],
      error: null
    })
    passkeyUpdateMock.mockResolvedValue({
      data: {
        id: 'passkey-1',
        friendly_name: 'Bryan iPhone',
        created_at: '2026-05-01T00:00:00.000Z',
        last_used_at: '2026-05-02T00:00:00.000Z'
      },
      error: null
    })
    passkeyDeleteMock.mockResolvedValue({
      data: null,
      error: null
    })

    const { useAuthStore } = await import('@/stores/auth')
    const authStore = useAuthStore()

    await expect(authStore.registerPasskey()).resolves.toEqual({
      id: 'registration-1'
    })

    await expect(authStore.listPasskeys()).resolves.toEqual([
      {
        id: 'passkey-1',
        friendly_name: 'iPhone',
        created_at: '2026-05-01T00:00:00.000Z',
        last_used_at: '2026-05-02T00:00:00.000Z'
      }
    ])

    await expect(authStore.renamePasskey('passkey-1', ' Bryan iPhone ')).resolves.toEqual({
      id: 'passkey-1',
      friendly_name: 'Bryan iPhone',
      created_at: '2026-05-01T00:00:00.000Z',
      last_used_at: '2026-05-02T00:00:00.000Z'
    })

    await expect(authStore.renamePasskey('passkey-1', ' ')).rejects.toThrow('請輸入 Passkey 名稱。')

    await authStore.deletePasskey('passkey-1')

    expect(registerPasskeyMock).toHaveBeenCalledTimes(1)
    expect(passkeyListMock).toHaveBeenCalledTimes(1)
    expect(passkeyUpdateMock).toHaveBeenCalledWith({
      passkeyId: 'passkey-1',
      friendlyName: 'Bryan iPhone'
    })
    expect(passkeyDeleteMock).toHaveBeenCalledWith({
      passkeyId: 'passkey-1'
    })
  })
})
