// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QuarterlyPaymentAmountControls from './QuarterlyPaymentAmountControls.vue'

const { alertMock } = vi.hoisted(() => ({
  alertMock: vi.fn().mockResolvedValue('confirm')
}))

vi.mock('element-plus', () => ({
  ElMessageBox: {
    alert: alertMock
  }
}))

const ElInputNumberStub = {
  name: 'ElInputNumber',
  props: ['modelValue', 'disabled', 'min', 'max', 'step', 'size'],
  emits: ['update:modelValue', 'change'],
  template: '<input :value="modelValue" :disabled="disabled" />'
}

const mountControls = (props = {}) => mount(QuarterlyPaymentAmountControls, {
  props: {
    memberName: '小熊',
    amount: 6000,
    balanceAmount: 0,
    availableBalance: 1000,
    formatCurrency: (amount: number) => `$${amount.toLocaleString('en-US')}`,
    ...props
  },
  global: {
    stubs: {
      ElInputNumber: ElInputNumberStub
    }
  }
})

describe('QuarterlyPaymentAmountControls', () => {
  beforeEach(() => {
    alertMock.mockClear()
  })

  it('reminds the parent to use the available balance after manually changing the fee amount', async () => {
    const wrapper = mountControls()
    const amountInput = wrapper.findAllComponents(ElInputNumberStub)[0]

    amountInput.vm.$emit('change', 6100, 6000)
    await wrapper.vm.$nextTick()

    expect(alertMock).toHaveBeenCalledWith(
      '小熊目前有可用餘額 $1,000，請使用下方「餘額扣抵」功能。',
      '提醒使用可用餘額',
      expect.objectContaining({
        type: 'warning',
        confirmButtonText: '我知道了'
      })
    )

    amountInput.vm.$emit('change', 6200, 6100)
    await wrapper.vm.$nextTick()
    expect(alertMock).toHaveBeenCalledTimes(1)
  })

  it('does not show a reminder when no balance can be deducted', async () => {
    const wrapper = mountControls({ availableBalance: 0 })
    const amountInput = wrapper.findComponent(ElInputNumberStub)

    amountInput.vm.$emit('change', 6100, 6000)
    await wrapper.vm.$nextTick()

    expect(alertMock).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('餘額扣抵')
  })
})
