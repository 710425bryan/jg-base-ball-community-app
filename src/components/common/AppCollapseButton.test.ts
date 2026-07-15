// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppCollapseButton from './AppCollapseButton.vue'

describe('AppCollapseButton', () => {
  it('describes its controlled section and emits a toggle request', async () => {
    const wrapper = mount(AppCollapseButton, {
      props: {
        expanded: false,
        controls: 'example-content',
        label: '範例區塊'
      },
      global: {
        stubs: {
          'el-icon': {
            template: '<span><slot /></span>'
          }
        }
      }
    })

    const button = wrapper.get('button')
    expect(button.attributes('aria-controls')).toBe('example-content')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-label')).toBe('展開範例區塊')
    expect(button.text()).toContain('展開')

    await button.trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)

    await wrapper.setProps({ expanded: true })
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(button.attributes('aria-label')).toBe('收合範例區塊')
    expect(button.text()).toContain('收合')
  })
})
