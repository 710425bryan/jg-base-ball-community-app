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
      verifyOtp: verifyOtpMock
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
        name: '管理員'
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
})
