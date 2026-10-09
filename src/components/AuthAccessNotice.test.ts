// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AuthAccessNotice from './AuthAccessNotice.vue'

describe('AuthAccessNotice', () => {
  it('keeps the revocation reason visible until the user acknowledges it', async () => {
    const wrapper = mount(AuthAccessNotice, { props: { message: '此帳號已被停權，無法登入系統。' } })
    expect(wrapper.get('[role="alert"]').text()).toContain('已自動登出')
    expect(wrapper.text()).toContain('此帳號已被停權，無法登入系統。')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})
