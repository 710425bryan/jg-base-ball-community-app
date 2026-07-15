// @vitest-environment jsdom

import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppMobileFilterSheet from './AppMobileFilterSheet.vue'

const DrawerStub = defineComponent({
  props: ['modelValue'],
  emits: ['close'],
  template: '<section v-if="modelValue"><slot /></section>'
})

const ButtonStub = defineComponent({
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
})

const mountSheet = () => mount(AppMobileFilterSheet, {
  props: { modelValue: true, activeCount: 2 },
  slots: { default: '<label>篩選內容</label>' },
  global: {
    stubs: {
      'el-drawer': DrawerStub,
      'el-button': ButtonStub,
      'el-icon': { template: '<span><slot /></span>' },
      Close: true
    }
  }
})

describe('AppMobileFilterSheet', () => {
  it('renders the active count and filter content', () => {
    const wrapper = mountSheet()

    expect(wrapper.text()).toContain('已套用 2 個條件')
    expect(wrapper.text()).toContain('篩選內容')
  })

  it('keeps clear separate and closes only after confirmation', async () => {
    const wrapper = mountSheet()
    const buttons = wrapper.findAll('button')

    await buttons.at(-2)?.trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await buttons.at(-1)?.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('provides a 44px accessible close control', () => {
    const wrapper = mountSheet()
    const closeButton = wrapper.get('button[aria-label="關閉篩選"]')

    expect(closeButton.attributes('title')).toBe('關閉篩選')
    expect(closeButton.classes()).toContain('app-icon-button')
  })
})
