// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import QuarterlyPaymentAmountControls from './QuarterlyPaymentAmountControls.vue'

const ElInputNumberStub = {
  name: 'ElInputNumber',
  props: ['modelValue', 'disabled', 'min', 'max', 'step', 'size', 'ariaLabel'],
  emits: ['update:modelValue', 'change'],
  template: '<input :value="modelValue" :disabled="disabled" />'
}

const mountControls = (props = {}) => mount(QuarterlyPaymentAmountControls, {
  props: {
    memberName: '小熊',
    expectedAmount: 6000,
    balanceAmount: 0,
    reportedExternalAmount: 6000,
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
  it('renders the server expected amount as read only and lets the user report actual payment', async () => {
    const wrapper = mountControls()
    const inputs = wrapper.findAllComponents(ElInputNumberStub)

    expect(wrapper.text()).toContain('系統應收')
    expect(wrapper.text()).toContain('$6,000')
    expect(inputs).toHaveLength(2)
    inputs[1].vm.$emit('update:modelValue', 5500)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:reportedExternalAmount')?.[0]).toEqual([5500])
  })

  it('shows correct cash due and mismatch status', () => {
    const wrapper = mountControls({
      balanceAmount: 1000,
      reportedExternalAmount: 5500
    })

    expect(wrapper.text()).toContain('正確應付')
    expect(wrapper.text()).toContain('$5,000')
    expect(wrapper.text()).toContain('多繳')
    expect(wrapper.text()).toContain('+$500')
  })
})
