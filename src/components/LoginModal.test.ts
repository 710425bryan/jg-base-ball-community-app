// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginModal from './LoginModal.vue'

const routerPushMock = vi.hoisted(() => vi.fn())
const authStoreMock = vi.hoisted(() => ({
  sendMagicLink: vi.fn(),
  verifyOtpCode: vi.fn(),
  signInWithPasskey: vi.fn(),
  isPasskeyApiAvailable: true
}))
const passkeySupportState = vi.hoisted(() => ({
  value: false
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreMock
}))

vi.mock('@/utils/passkeySupport', () => ({
  isPasskeySupported: () => passkeySupportState.value,
  isSupabasePasskeyServerEnabled: () => Promise.resolve(passkeySupportState.value),
  getPasskeyAuthErrorMessage: (_error: unknown, fallback?: string) =>
    fallback || 'Passkey 驗證失敗，請改用 email 驗證碼登入。'
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

describe('LoginModal passkey entry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    passkeySupportState.value = false
    authStoreMock.isPasskeyApiAvailable = true
    authStoreMock.signInWithPasskey.mockResolvedValue({
      session: {
        access_token: 'token',
        user: {
          id: 'user-1'
        }
      }
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('does not show passkey login when WebAuthn is unsupported', () => {
    const wrapper = mount(LoginModal, {
      props: {
        modelValue: true
      },
      global: {
        stubs: {
          Teleport: true,
          Transition: false
        }
      }
    })

    expect(wrapper.find('[data-testid="passkey-login-button"]').exists()).toBe(false)
  })

  it('does not show passkey login when the Supabase SDK namespace is unavailable', () => {
    passkeySupportState.value = true
    authStoreMock.isPasskeyApiAvailable = false

    const wrapper = mount(LoginModal, {
      props: {
        modelValue: true
      },
      global: {
        stubs: {
          Teleport: true,
          Transition: false
        }
      }
    })

    expect(wrapper.find('[data-testid="passkey-login-button"]').exists()).toBe(false)
  })

  it('shows passkey login when supported and routes after success', async () => {
    passkeySupportState.value = true

    const wrapper = mount(LoginModal, {
      props: {
        modelValue: true
      },
      global: {
        stubs: {
          Teleport: true,
          Transition: false
        }
      }
    })
    await flushPromises()

    const passkeyButton = wrapper.find('[data-testid="passkey-login-button"]')
    expect(passkeyButton.exists()).toBe(true)

    await passkeyButton.trigger('click')

    expect(authStoreMock.signInWithPasskey).toHaveBeenCalledTimes(1)
    expect(routerPushMock).toHaveBeenCalledWith('/dashboard')
  })
})
