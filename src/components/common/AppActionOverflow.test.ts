// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import AppActionOverflow from './AppActionOverflow.vue'

const ElDropdownStub = defineComponent({
  name: 'ElDropdown',
  emits: ['command'],
  template: '<div><slot /><slot name="dropdown" /></div>'
})

describe('AppActionOverflow', () => {
  it('provides an accessible 44px trigger and forwards commands', async () => {
    const wrapper = mount(AppActionOverflow, {
      slots: {
        default: '<span>編輯</span>'
      },
      global: {
        stubs: {
          'el-icon': { template: '<span><slot /></span>' },
          'el-dropdown-menu': { template: '<div><slot /></div>' },
          'el-dropdown': ElDropdownStub,
          MoreFilled: true
        }
      }
    })

    const trigger = wrapper.get('button')
    expect(trigger.attributes('aria-label')).toBe('更多操作')
    expect(trigger.attributes('title')).toBe('更多操作')
    expect(trigger.classes()).toContain('app-icon-button')

    wrapper.findComponent({ name: 'ElDropdown' }).vm.$emit('command', 'edit')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('command')).toEqual([['edit']])
  })
})
