// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'

const authStoreMock = vi.hoisted(() => ({
  isInitializing: true,
  ensureInitialized: vi.fn()
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
})
