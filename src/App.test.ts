// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import App from './App.vue'

const authStoreMock = reactive({
  isInitializing: true,
  isAuthenticated: false,
  accessDeniedMessage: '',
  ensureInitialized: vi.fn()
})
const routeMock = reactive({ meta: { requiresAuth: false } })
const replaceMock = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ replace: replaceMock })
}))
const initializeReadableTextModeMock = vi.hoisted(() => vi.fn())

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authStoreMock
}))

vi.mock('@/composables/useReadableTextMode', () => ({
  useReadableTextMode: () => ({
    initializeReadableTextMode: initializeReadableTextModeMock
  })
}))

vi.mock('@/components/common/AppLoadingState.vue', () => ({
  default: {
    name: 'AppLoadingState',
    template: '<div data-test="app-loading-state" />'
  }
}))

vi.mock('@/components/layout/HolidayThemeSiteEffects.vue', () => ({
  default: {
    name: 'HolidayThemeSiteEffects',
    template: '<div data-test="holiday-theme-site-effects" />'
  }
}))

const mountApp = () => mount(App, {
  global: {
    stubs: {
      RouterView: {
        template: '<main data-test="router-view" />'
      }
    }
  }
})

describe('App bootstrap shell', () => {
  beforeEach(() => {
    authStoreMock.isInitializing = true
    authStoreMock.isAuthenticated = false
    authStoreMock.accessDeniedMessage = ''
    routeMock.meta.requiresAuth = false
    replaceMock.mockReset().mockResolvedValue(undefined)
    authStoreMock.ensureInitialized.mockReset()
    authStoreMock.ensureInitialized.mockResolvedValue(undefined)
    initializeReadableTextModeMock.mockReset()
  })

  it('initializes readable text mode and auth on mount', async () => {
    mountApp()
    await flushPromises()

    expect(initializeReadableTextModeMock).toHaveBeenCalledTimes(1)
    expect(authStoreMock.ensureInitialized).toHaveBeenCalledTimes(1)
  })

  it('shows the loading state while auth initialization is pending', () => {
    const wrapper = mountApp()

    expect(wrapper.find('[data-test="app-loading-state"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="router-view"]').exists()).toBe(false)
  })

  it('renders site effects and the router outlet after auth initialization', () => {
    authStoreMock.isInitializing = false
    const wrapper = mountApp()

    expect(wrapper.find('[data-test="holiday-theme-site-effects"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="router-view"]').exists()).toBe(true)
  })

  it('unmounts protected content on suspension and keeps the explanation after redirecting', async () => {
    authStoreMock.isInitializing = false
    authStoreMock.isAuthenticated = true
    routeMock.meta.requiresAuth = true
    const wrapper = mountApp()
    expect(wrapper.find('[data-test="router-view"]').exists()).toBe(true)
    authStoreMock.accessDeniedMessage = '此帳號已被停權，無法登入系統。'
    authStoreMock.isAuthenticated = false
    await flushPromises()
    expect(wrapper.find('[data-test="router-view"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('已自動登出')
    expect(wrapper.text()).toContain('此帳號已被停權，無法登入系統。')
    expect(replaceMock).toHaveBeenCalledWith('/')
    routeMock.meta.requiresAuth = false
    await wrapper.get('button').trigger('click')
    expect(wrapper.find('[data-test="router-view"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
