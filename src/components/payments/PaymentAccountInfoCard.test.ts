// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PaymentAccountInfoCard from './PaymentAccountInfoCard.vue'

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessage: messageMock
}))

describe('PaymentAccountInfoCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined)
      }
    })
  })

  it('toggles account details and copies account numbers', async () => {
    const wrapper = mount(PaymentAccountInfoCard, {
      global: {
        stubs: {
          'el-icon': true,
          ArrowDown: true,
          ArrowUp: true,
          CopyDocument: true,
          Wallet: true
        }
      }
    })

    expect(wrapper.text()).toContain('球隊收款帳戶')
    expect(wrapper.text()).toContain('查看帳戶資訊')

    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('收起帳戶資訊')
    expect(wrapper.text()).toContain('2445012-0006187')

    const copyButton = wrapper.findAll('button').find((button) => button.text().includes('複製帳號'))
    await copyButton?.trigger('click')

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('24450120006187')
    expect(messageMock.success).toHaveBeenCalledWith('繳費帳號已複製')
  })
})
