// @vitest-environment jsdom
// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

import HolidayThemeRibbon from '../HolidayThemeRibbon.vue'

const useHolidayThemeMock = vi.fn()

vi.mock('@/composables/useHolidayTheme', () => ({
  useHolidayTheme: () => useHolidayThemeMock(),
}))

const createTheme = (overrides = {}) => ({
  enabled: true,
  label: 'Mothers Day',
  ribbonTitle: '',
  ribbonMessage: 'Primary ribbon copy',
  messages: ['Hero message one', 'Hero message two'],
  ribbonMessages: ['Primary ribbon copy', 'Secondary ribbon copy'],
  showGlobalRibbon: true,
  token: 'theme-a',
  paletteValues: {
    ribbonFrom: '#ec4899',
    ribbonTo: '#be185d',
    glow: 'rgba(244,114,182,0.22)',
  },
  ...overrides,
})

describe('HolidayThemeRibbon.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the ribbon and hides it after dismiss', async () => {
    const themeRef = ref(createTheme())

    useHolidayThemeMock.mockReturnValue({
      holidayTheme: themeRef,
    })

    const wrapper = mount(HolidayThemeRibbon, {
      global: {
        stubs: {
          'el-icon': { template: '<span><slot /></span>' },
        },
      },
    })

    expect(wrapper.text()).toContain('Mothers Day')
    expect(wrapper.get('[data-test="holiday-theme-ribbon-title"]').text()).toBe('Mothers Day祝福')
    expect(wrapper.get('[data-test="holiday-theme-ribbon-message"]').text()).toBe('Primary ribbon copy')

    await wrapper.get('[data-test="holiday-theme-ribbon-close"]').trigger('click')

    expect(window.localStorage.getItem('jg_holiday_ribbon_dismissed_token')).toBe('theme-a')
    await nextTick()
    expect(wrapper.find('[data-test="holiday-theme-ribbon"]').exists()).toBe(false)
  })

  it('shows the ribbon again when the active theme token changes', async () => {
    const themeRef = ref(createTheme())

    useHolidayThemeMock.mockReturnValue({
      holidayTheme: themeRef,
    })

    const wrapper = mount(HolidayThemeRibbon, {
      global: {
        stubs: {
          'el-icon': { template: '<span><slot /></span>' },
        },
      },
    })

    await wrapper.get('[data-test="holiday-theme-ribbon-close"]').trigger('click')
    expect(wrapper.find('[data-test="holiday-theme-ribbon"]').exists()).toBe(false)

    themeRef.value = createTheme({
      label: 'Fathers Day',
      ribbonMessage: 'New ribbon copy',
      messages: ['Hero line', 'Second hero line'],
      ribbonMessages: ['New ribbon copy', 'Another new line'],
      token: 'theme-b',
      paletteValues: {
        ribbonFrom: '#1d4ed8',
        ribbonTo: '#0f766e',
        glow: 'rgba(96,165,250,0.22)',
      },
    })

    await nextTick()

    expect(wrapper.find('[data-test="holiday-theme-ribbon"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Fathers Day')
    expect(wrapper.get('[data-test="holiday-theme-ribbon-message"]').text()).toBe('New ribbon copy')
  })

  it('rotates ribbon messages when multiple lines are available', async () => {
    const themeRef = ref(createTheme({
      ribbonMessages: ['Line one', 'Line two', 'Line three'],
      ribbonMessage: 'Line one',
    }))

    useHolidayThemeMock.mockReturnValue({
      holidayTheme: themeRef,
    })

    const wrapper = mount(HolidayThemeRibbon, {
      global: {
        stubs: {
          'el-icon': { template: '<span><slot /></span>' },
        },
      },
    })

    expect(wrapper.get('[data-test="holiday-theme-ribbon-message"]').text()).toBe('Line one')

    await vi.advanceTimersByTimeAsync(4500)
    await nextTick()
    expect(wrapper.get('[data-test="holiday-theme-ribbon-message"]').text()).toBe('Line two')

    await vi.advanceTimersByTimeAsync(4500)
    await nextTick()
    expect(wrapper.get('[data-test="holiday-theme-ribbon-message"]').text()).toBe('Line three')
  })

  it('renders a custom ribbon title when provided', async () => {
    const themeRef = ref(createTheme({
      label: 'First Hit',
      ribbonTitle: '首安時刻祝福',
    }))

    useHolidayThemeMock.mockReturnValue({
      holidayTheme: themeRef,
    })

    const wrapper = mount(HolidayThemeRibbon, {
      global: {
        stubs: {
          'el-icon': { template: '<span><slot /></span>' },
        },
      },
    })

    expect(wrapper.get('[data-test="holiday-theme-ribbon-title"]').text()).toBe('首安時刻祝福')
  })

  it('falls back to hero messages when custom ribbon copy is not provided', async () => {
    const themeRef = ref(createTheme({
      messages: ['Hero line one', 'Hero line two'],
      ribbonMessages: [],
      ribbonMessage: 'Hero line one',
    }))

    useHolidayThemeMock.mockReturnValue({
      holidayTheme: themeRef,
    })

    const wrapper = mount(HolidayThemeRibbon, {
      global: {
        stubs: {
          'el-icon': { template: '<span><slot /></span>' },
        },
      },
    })

    expect(wrapper.get('[data-test="holiday-theme-ribbon-message"]').text()).toBe('Hero line one')

    await vi.advanceTimersByTimeAsync(4500)
    await nextTick()
    expect(wrapper.get('[data-test="holiday-theme-ribbon-message"]').text()).toBe('Hero line two')
  })
})
