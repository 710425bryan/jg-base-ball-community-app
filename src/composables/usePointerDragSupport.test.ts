// @vitest-environment jsdom

import { defineComponent, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import { usePointerDragSupport } from './usePointerDragSupport'

describe('usePointerDragSupport', () => {
  it('only enables native dragging for a fine pointer with hover support', async () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener,
        removeEventListener
      }))
    })

    const wrapper = mount(defineComponent({
      setup() {
        return { canDrag: usePointerDragSupport() }
      },
      template: '<div :data-can-drag="canDrag" />'
    }))

    expect(wrapper.attributes('data-can-drag')).toBe('false')

    const capabilityListener = addEventListener.mock.calls[0][1] as (event: MediaQueryListEvent) => void
    capabilityListener({ matches: true } as MediaQueryListEvent)
    await nextTick()
    expect(wrapper.attributes('data-can-drag')).toBe('true')

    wrapper.unmount()
    expect(removeEventListener).toHaveBeenCalledOnce()
  })
})
