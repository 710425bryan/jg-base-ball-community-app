// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { ElDialog } from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AppGlobalDialog from './AppGlobalDialog.vue'

describe('AppGlobalDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('teleports dialogs to body by default and forwards the existing dialog contract', async () => {
    const onUpdateModelValue = vi.fn()
    const wrapper = mount(AppGlobalDialog, {
      attachTo: document.body,
      attrs: {
        modelValue: true,
        title: '全站 Dialog 測試',
        'onUpdate:modelValue': onUpdateModelValue
      },
      slots: {
        default: '<div data-test="dialog-body">內容</div>',
        footer: '<button data-test="dialog-footer">送出</button>'
      }
    })

    await flushPromises()

    const dialog = wrapper.findComponent(ElDialog)
    const overlay = document.body.querySelector('.el-overlay')
    expect(dialog.props('appendToBody')).toBe(true)
    expect(dialog.props('modelValue')).toBe(true)
    expect(overlay).not.toBeNull()
    expect(overlay?.closest('[data-v-app]')).toBeNull()
    expect(document.body.querySelector('[data-test="dialog-body"]')?.textContent).toBe('內容')
    expect(document.body.querySelector('[data-test="dialog-footer"]')?.textContent).toBe('送出')

    dialog.vm.$emit('update:modelValue', false)
    expect(onUpdateModelValue).toHaveBeenCalledWith(false)

    wrapper.unmount()
  })
})
