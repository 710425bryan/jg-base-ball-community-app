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

const endCompositionWithoutInput = (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new CompositionEvent('compositionend', {
    bubbles: true,
    data: value
  }))
}

const updateCompositionWithoutInput = (input: HTMLInputElement, value: string) => {
  input.dispatchEvent(new CompositionEvent('compositionstart', {
    bubbles: true,
    data: ''
  }))
  input.value = value
  input.dispatchEvent(new CompositionEvent('compositionupdate', {
    bubbles: true,
    data: value
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
    vi.useRealTimers()
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

  it('updates the built-in option filter when composition updates without an input event', async () => {
    const wrapper = mountSelect()
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    input.click()
    await nextTick()
    updateCompositionWithoutInput(input, '田')
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

  it('refreshes an existing custom filter when iOS ends composition without an input event', () => {
    const filterMethod = vi.fn()
    const wrapper = mountSelect(filterMethod)
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    endCompositionWithoutInput(input, '張')

    expect(filterMethod).toHaveBeenCalledWith('張')

    wrapper.unmount()
  })

  it('observes the focused input value when iOS dispatches no text event', async () => {
    vi.useFakeTimers()
    const filterMethod = vi.fn()
    const wrapper = mountSelect(filterMethod)
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    input.focus()
    await nextTick()
    input.value = '田'
    await vi.advanceTimersByTimeAsync(60)
    await nextTick()

    expect(filterMethod).toHaveBeenCalledWith('田')
    expect(input.value).toBe('田')

    wrapper.unmount()
  })

  it('refreshes built-in options from the focused input value without text events', async () => {
    vi.useFakeTimers()
    const wrapper = mountSelect()
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    input.focus()
    input.click()
    await nextTick()
    input.value = '田'
    await vi.advanceTimersByTimeAsync(60)
    await nextTick()

    const options = wrapper.findAll('.el-select-dropdown__item')
    expect(options).toHaveLength(2)
    expect(options[0].isVisible()).toBe(false)
    expect(options[1].isVisible()).toBe(true)
    expect(input.value).toBe('田')

    wrapper.unmount()
  })

  it('observes the input after the dropdown opens when no usable focus event reaches the wrapper', async () => {
    vi.useFakeTimers()
    const wrapper = mountSelect()
    const select = wrapper.getComponent(ElSelect)
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    select.vm.toggleMenu()
    await nextTick()
    input.value = '田'
    await vi.advanceTimersByTimeAsync(60)
    await nextTick()

    const options = wrapper.findAll('.el-select-dropdown__item')
    expect(options).toHaveLength(2)
    expect(options[0].isVisible()).toBe(false)
    expect(options[1].isVisible()).toBe(true)
    expect(input.value).toBe('田')

    wrapper.unmount()
  })

  it('runs an existing custom filter after the dropdown opens without focus or text events', async () => {
    vi.useFakeTimers()
    const filterMethod = vi.fn()
    const wrapper = mountSelect(filterMethod)
    const select = wrapper.getComponent(ElSelect)
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    select.vm.toggleMenu()
    await nextTick()
    input.value = '田'
    await vi.advanceTimersByTimeAsync(60)

    expect(filterMethod).toHaveBeenCalledWith('田')

    select.vm.toggleMenu()
    await nextTick()
    filterMethod.mockClear()
    input.value = '陳'
    await vi.advanceTimersByTimeAsync(60)

    expect(filterMethod).not.toHaveBeenCalled()

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

  it('forwards existing focus and blur event handlers after adding input observation', async () => {
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    const onVisibleChange = vi.fn()
    const wrapper = mount(AppGlobalSelect, {
      attachTo: document.body,
      attrs: {
        filterable: true,
        modelValue: '',
        teleported: false,
        onFocus,
        onBlur,
        onVisibleChange
      }
    })
    const select = wrapper.getComponent(ElSelect)
    select.vm.$emit('focus', new FocusEvent('focus'))
    select.vm.$emit('blur', new FocusEvent('blur'))
    select.vm.$emit('visible-change', true)

    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(onVisibleChange).toHaveBeenCalledWith(true)

    wrapper.unmount()
  })
})
