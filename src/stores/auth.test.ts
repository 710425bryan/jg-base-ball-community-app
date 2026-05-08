// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

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
