// @vitest-environment jsdom
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { useForegroundRefresh } from './useForegroundRefresh'

describe('foreground refresh', () => {
  it('refreshes visible pages and mutations, then removes listeners on unmount', async () => {
    const refresh = vi.fn()
    const wrapper = mount(defineComponent({ setup() {
      useForegroundRefresh(refresh, ['coach-leave-changed'])
      return () => null
    } }))
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('coach-leave-changed'))
    await flushPromises()
    expect(refresh).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(refresh).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    wrapper.unmount()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
