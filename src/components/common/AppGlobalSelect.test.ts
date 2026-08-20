// @vitest-environment jsdom

import { h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { ElOption, ElSelect } from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppGlobalSelect from './AppGlobalSelect.vue'

const startComposing = (input: HTMLInputElement, value: string) => {
  input.dispatchEvent(new CompositionEvent('compositionstart', {
    bubbles: true,
    data: value
  }))
  input.value = value
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    data: value,
    inputType: 'insertCompositionText',
    isComposing: true
  }))
}

const mountSelect = (filterMethod?: (query: string) => void) => mount(AppGlobalSelect, {
  attachTo: document.body,
  attrs: {
    filterable: true,
    filterMethod,
    modelValue: '',
    teleported: false
  },
  slots: {
    default: () => [
      h(ElOption, { label: '陳柏翰', value: 'member-1' }),
      h(ElOption, { label: '田小明', value: 'member-2' })
    ]
  }
})

describe('AppGlobalSelect', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('updates the built-in option filter while a Chinese IME is still composing', async () => {
    const wrapper = mountSelect()
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    startComposing(input, '田')
    await nextTick()

    const options = wrapper.findAll('.el-select-dropdown__item')
    expect(options).toHaveLength(2)
    expect(options[0].isVisible()).toBe(false)
    expect(options[1].isVisible()).toBe(true)

    wrapper.unmount()
  })

  it('runs an existing custom filter method during Chinese IME composition', () => {
    const filterMethod = vi.fn()
    const wrapper = mountSelect(filterMethod)
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    startComposing(input, '田')

    expect(filterMethod).toHaveBeenCalledWith('田')

    wrapper.unmount()
  })

  it('forwards the existing single and multiple model contracts', () => {
    const updateSingle = vi.fn()
    const single = mount(AppGlobalSelect, {
      attrs: {
        modelValue: '',
        'onUpdate:modelValue': updateSingle
      }
    })

    single.getComponent(ElSelect).vm.$emit('update:modelValue', 'member-1')
    expect(updateSingle).toHaveBeenCalledWith('member-1')
    single.unmount()

    const updateMultiple = vi.fn()
    const multiple = mount(AppGlobalSelect, {
      attrs: {
        modelValue: [],
        multiple: true,
        'onUpdate:modelValue': updateMultiple
      }
    })

    multiple.getComponent(ElSelect).vm.$emit('update:modelValue', ['member-1', 'member-2'])
    expect(updateMultiple).toHaveBeenCalledWith(['member-1', 'member-2'])
    multiple.unmount()
  })

  it('keeps the public focus and blur controls used by existing select refs', async () => {
    const wrapper = mountSelect()
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement
    const exposed = wrapper.vm as unknown as { focus: () => void; blur: () => void }

    exposed.focus()
    await nextTick()
    expect(document.activeElement).toBe(input)

    exposed.blur()
    await nextTick()
    expect(document.activeElement).not.toBe(input)

    wrapper.unmount()
  })
})
