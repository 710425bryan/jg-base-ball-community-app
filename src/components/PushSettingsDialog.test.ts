// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import PushSettingsDialog from './PushSettingsDialog.vue'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  permission: vi.fn(),
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  diagnostics: vi.fn(),
  user: { id: 'user-1' }
}))
vi.mock('@/utils/webPushPublicKey', () => ({ WEB_PUSH_PUBLIC_KEY: 'AQIDBA' }))
vi.mock('@/services/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ user: mocks.user }) }))
vi.mock('@/utils/pushDeepLink', () => ({ readPushDeepLinkDiagnostics: mocks.diagnostics }))
vi.mock('element-plus', () => ({ ElMessage: { error: mocks.error, success: mocks.success, warning: vi.fn(), info: vi.fn() } }))

const oldSubscription = () => ({
  options: { applicationServerKey: new Uint8Array([9, 9]).buffer },
  endpoint: 'https://push.test/old',
  toJSON: () => ({ endpoint: 'https://push.test/old', keys: { p256dh: 'test', auth: 'test' } }),
  unsubscribe: mocks.unsubscribe
})
const currentSubscription = () => ({
  ...oldSubscription(),
  options: { applicationServerKey: new Uint8Array([1, 2, 3, 4]).buffer },
  endpoint: 'https://push.test/current',
  toJSON: () => ({ endpoint: 'https://push.test/current', keys: { p256dh: 'new-test', auth: 'new-test' } })
})
const wrappers: VueWrapper[] = []
const mountDialog = () => {
  const wrapper = mount(PushSettingsDialog, {
    props: { modelValue: true },
    global: {
      directives: { loading: {} },
      stubs: {
        'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
        'el-switch': { props: ['modelValue', 'disabled'], template: '<input type="checkbox" :checked="modelValue" :disabled="disabled" />' },
        'el-button': { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
        'el-icon': true
      }
    }
  })
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('PushManager', function () {})
  vi.stubGlobal('Notification', { permission: 'granted', requestPermission: mocks.permission })
  const registration = {
    pushManager: { getSubscription: mocks.getSubscription, subscribe: mocks.subscribe },
    active: { scriptURL: 'https://app.test/sw.js' }
  }
  vi.stubGlobal('navigator', {
    userAgent: 'test desktop', platform: 'test', maxTouchPoints: 0,
    serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration), controller: null }
  })
  mocks.diagnostics.mockResolvedValue(null)
  mocks.getSubscription.mockResolvedValue(oldSubscription())
  mocks.unsubscribe.mockResolvedValue(true)
  mocks.subscribe.mockResolvedValue(currentSubscription())
  mocks.rpc.mockImplementation((name) => {
    if (name === 'get_my_web_push_subscription') return { maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'old-row', enabled: true }, error: null }) }
    if (name === 'upsert_my_web_push_subscription') return { single: vi.fn().mockResolvedValue({ data: { id: 'new-row' }, error: null }) }
    throw new Error(`Unexpected RPC: ${name}`)
  })
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.unstubAllGlobals()
})

describe('PushSettingsDialog subscription renewal', () => {
  it('shows a stale subscription as needing re-enable without changing browser or server state on open', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.text()).toContain('此裝置需要重新啟用推播')
    expect(wrapper.get('input').element.checked).toBe(false)
    expect(wrapper.text()).not.toContain('此裝置已成功綁定系統推播通知！')
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
    expect(mocks.permission).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('get_my_web_push_subscription', { p_endpoint: 'https://push.test/old' })
    expect(mocks.diagnostics).toHaveBeenCalledTimes(1)
  })

  it('renews only on explicit action and registers the new subscription', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === '重新啟用推播')!.trigger('click')
    await flushPromises()
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1)
    expect(mocks.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3, 4]) })
    expect(mocks.rpc).toHaveBeenCalledWith('upsert_my_web_push_subscription', expect.objectContaining({
      p_endpoint: 'https://push.test/current', p_enabled: true,
      p_subscription: currentSubscription().toJSON()
    }))
    expect(wrapper.text()).not.toContain('此裝置需要重新啟用推播')
    expect(wrapper.get('input').element.checked).toBe(true)
    expect(wrapper.text()).toContain('此裝置已成功綁定系統推播通知！')
  })

  it('keeps the re-enable notice and switch off when browser replacement fails', async () => {
    mocks.subscribe.mockRejectedValue(new Error('Subscription failed'))
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === '重新啟用推播')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('此裝置需要重新啟用推播')
    expect(wrapper.get('input').element.checked).toBe(false)
    expect(mocks.error).toHaveBeenCalledWith('Subscription failed')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('keeps the switch off when registration fails after browser renewal', async () => {
    mocks.rpc.mockImplementation((name) => {
      if (name === 'get_my_web_push_subscription') return { maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'old-row', enabled: false }, error: null }) }
      return { single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Registration failed' } }) }
    })
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === '重新啟用推播')!.trigger('click')
    await flushPromises()
    expect(wrapper.get('input').element.checked).toBe(false)
    expect(wrapper.text()).toContain('此裝置需要重新啟用推播')
    expect(wrapper.text()).not.toContain('此裝置已成功綁定系統推播通知！')
    expect(mocks.error).toHaveBeenCalledWith('Registration failed')
  })

  it('preserves the old subscription when the user denies notification permission', async () => {
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: mocks.permission })
    mocks.permission.mockResolvedValue('denied')
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === '重新啟用推播')!.trigger('click')
    await flushPromises()
    expect(mocks.permission).toHaveBeenCalledTimes(1)
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(wrapper.get('input').element.checked).toBe(false)
    expect(wrapper.text()).toContain('此裝置需要重新啟用推播')
  })

  it('keeps an enabled matching subscription and does not prompt for re-enable', async () => {
    mocks.getSubscription.mockResolvedValue(currentSubscription())
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.get('input').element.checked).toBe(true)
    expect(wrapper.text()).not.toContain('此裝置需要重新啟用推播')
    expect(mocks.subscribe).not.toHaveBeenCalled()
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
  })
})
