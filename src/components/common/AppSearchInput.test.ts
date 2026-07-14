// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import AppSearchInput from './AppSearchInput.vue'

describe('AppSearchInput', () => {
  it('emits native search input changes for mobile WebViews', async () => {
    const wrapper = mount(AppSearchInput, {
      props: {
        modelValue: '',
        placeholder: '搜尋球員'
      }
    })

    await wrapper.get('input').setValue('王小明')

    expect(wrapper.emitted('update:modelValue')).toEqual([['王小明']])
    expect(wrapper.get('input').attributes('inputmode')).toBe('search')
  })

  it('clears the current query with a touch-sized button', async () => {
    const wrapper = mount(AppSearchInput, {
      props: {
        modelValue: 'U12'
      }
    })

    await wrapper.get('button[aria-label="清除搜尋"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })
})
