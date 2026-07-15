// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AppDialogFooter from './AppDialogFooter.vue'

const buttonStub = {
  props: ['type', 'loading', 'disabled', 'dataTest'],
  emits: ['click'],
  template: '<button :disabled="disabled" :data-type="type" :data-test="dataTest" @click="$emit(\'click\')"><slot /></button>'
}

describe('AppDialogFooter', () => {
  it('renders cancel before confirm and emits both actions', async () => {
    const wrapper = mount(AppDialogFooter, {
      props: { confirmLabel: '儲存變更' },
      global: { stubs: { 'el-button': buttonStub } }
    })
    const buttons = wrapper.findAll('button')
    expect(buttons.map(button => button.text())).toEqual(['取消', '儲存變更'])

    await buttons[0]?.trigger('click')
    await buttons[1]?.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('supports a single dangerous confirmation', () => {
    const wrapper = mount(AppDialogFooter, {
      props: { showCancel: false, danger: true, confirmLabel: '確定刪除' },
      global: { stubs: { 'el-button': buttonStub } }
    })
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.get('button').attributes('data-type')).toBe('danger')
  })

  it('places an optional test hook on the confirm action', () => {
    const wrapper = mount(AppDialogFooter, {
      props: { confirmDataTest: 'confirm-action' },
      global: { stubs: { 'el-button': buttonStub } }
    })

    expect(wrapper.findAll('button')[1]?.attributes('data-test')).toBe('confirm-action')
  })
})
