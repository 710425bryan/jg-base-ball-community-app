// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginModal from './LoginModal.vue'

enableAutoUnmount(afterEach)

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

describe('LoginModal OTP recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    passkeySupportState.value = false
    authStoreMock.sendMagicLink.mockResolvedValue(undefined)
    authStoreMock.verifyOtpCode.mockResolvedValue({ session: { user: { id: 'user-1' } } })
  })

  afterEach(() => vi.useRealTimers())

  const openEmailStep = async () => {
    const wrapper = mount(LoginModal, {
      props: { modelValue: true },
      global: { stubs: { Teleport: true, Transition: false } }
    })
    await wrapper.get('input[type="email"]').setValue('Test@Example.com')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    return wrapper
  }

  it('shows an actionable persistent error and resends to the normalized address after cooldown', async () => {
    authStoreMock.verifyOtpCode.mockRejectedValueOnce({ code: 'otp_expired', message: 'Token has expired or is invalid' })
    const wrapper = await openEmailStep()
    const scrollErrorIntoView = vi.fn()
    wrapper.get('[role="alert"]').element.scrollIntoView = scrollErrorIntoView
    const codeInput = wrapper.get('input[autocomplete="one-time-code"]')
    expect(codeInput.attributes('inputmode')).toBe('numeric')
    expect(codeInput.attributes('maxlength')).toBeUndefined()
    expect(wrapper.text()).toContain('test@example.com')
    await codeInput.setValue(' ０１２３ ４５６７ ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(authStoreMock.verifyOtpCode).toHaveBeenCalledWith('test@example.com', '01234567')
    expect(wrapper.get('[role="alert"]').text()).toContain('驗證碼已失效或不正確')
    expect(scrollErrorIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(wrapper.text()).not.toContain('Token has expired')
    expect(routerPushMock).not.toHaveBeenCalled()
    const resend = wrapper.findAll('button').find((button) => button.text().includes('秒後可重新寄送'))!
    expect(resend.attributes('disabled')).toBeDefined()
    await resend.trigger('click')
    expect(authStoreMock.sendMagicLink).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    await resend.trigger('click')
    await flushPromises()
    expect(authStoreMock.sendMagicLink).toHaveBeenCalledTimes(2)
    expect(authStoreMock.sendMagicLink).toHaveBeenLastCalledWith('test@example.com')
    expect(wrapper.get('[role="alert"]').text()).toBe('')
    expect(resend.text()).toContain('60 秒')
  })

  it('blocks duplicate verification and changing email while verification is pending', async () => {
    let resolveVerification!: (value: unknown) => void
    authStoreMock.verifyOtpCode.mockImplementationOnce(() => new Promise((resolve) => { resolveVerification = resolve }))
    const wrapper = await openEmailStep()
    await wrapper.get('input[autocomplete="one-time-code"]').setValue('01234567')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(authStoreMock.verifyOtpCode).toHaveBeenCalledTimes(1)
    const changeEmail = wrapper.findAll('button').find((button) => button.text() === '重新輸入 email')!
    expect(changeEmail.attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[aria-label="關閉登入視窗"]').attributes('disabled')).toBeDefined()
    resolveVerification({ session: { user: { id: 'user-1' } } })
    await flushPromises()
    expect(routerPushMock).toHaveBeenCalledTimes(1)
    expect(routerPushMock).toHaveBeenCalledWith('/dashboard')
  })

  it('blocks duplicate send requests and does not truncate an overlong code into a valid one', async () => {
    let resolveSend!: (value: unknown) => void
    authStoreMock.sendMagicLink.mockImplementationOnce(() => new Promise((resolve) => { resolveSend = resolve }))
    const wrapper = await openEmailStep()
    await wrapper.get('form').trigger('submit')
    expect(authStoreMock.sendMagicLink).toHaveBeenCalledTimes(1)
    resolveSend(undefined)
    await flushPromises()
    await wrapper.get('input[autocomplete="one-time-code"]').setValue('123456789')
    await wrapper.get('form').trigger('submit')
    expect(authStoreMock.verifyOtpCode).not.toHaveBeenCalled()
  })

  it('keeps the verification screen usable if resending is rate limited', async () => {
    const wrapper = await openEmailStep()
    await vi.advanceTimersByTimeAsync(60_000)
    authStoreMock.sendMagicLink.mockRejectedValueOnce({ code: 'over_email_send_rate_limit', status: 429 })
    const resend = wrapper.findAll('button').find((button) => button.text() === '重新寄送驗證碼')!
    await resend.trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('操作太頻繁')
    expect(wrapper.find('input[autocomplete="one-time-code"]').exists()).toBe(true)
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('preserves the same-email cooldown when returning to the email step', async () => {
    const wrapper = await openEmailStep()
    const changeEmail = wrapper.findAll('button').find((button) => button.text() === '重新輸入 email')!
    await changeEmail.trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(authStoreMock.sendMagicLink).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
})
