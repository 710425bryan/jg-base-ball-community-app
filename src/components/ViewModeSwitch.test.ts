// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ViewModeSwitch from './ViewModeSwitch.vue'

describe('ViewModeSwitch', () => {
  it('marks the active mode and emits selected mode changes', async () => {
    const wrapper = mount(ViewModeSwitch, {
      props: {
        modelValue: 'grid',
        gridLabel: '卡片',
        tableLabel: '表格'
      }
    })

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]?.attributes('aria-pressed')).toBe('true')
    expect(buttons[1]?.attributes('aria-pressed')).toBe('false')
    expect(wrapper.classes()).toContain('h-11')
    expect(wrapper.classes()).not.toContain('p-1')
    expect(wrapper.classes()).toContain('bg-slate-100/80')
    expect(wrapper.attributes('role')).toBe('group')
    expect(wrapper.attributes('aria-label')).toBe('檢視模式')
    expect(buttons[0]?.classes()).toContain('h-11')
    expect(buttons[0]?.classes()).toContain('min-h-11')
    expect(buttons[0]?.classes()).toContain('bg-orange-50')
    expect(buttons[0]?.classes()).not.toContain('bg-white')
    expect(buttons[1]?.classes()).toContain('hover:bg-slate-200/70')
    expect(buttons[1]?.classes()).not.toContain('hover:bg-white/70')
    expect(wrapper.text()).toContain('卡片')
    expect(wrapper.text()).toContain('表格')

    await buttons[1]?.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['table']])
  })
})
