// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PaymentSubmissionSummary from './PaymentSubmissionSummary.vue'

describe('PaymentSubmissionSummary', () => {
  it('renders line items and normalized payment amounts', () => {
    const wrapper = mount(PaymentSubmissionSummary, {
      props: {
        memberName: '小明',
        totalAmount: 1500.9,
        availableBalance: 500,
        balanceAmount: 200,
        lineItems: [
          {
            id: 'item-1',
            typeLabel: '月費',
            title: '7 月月費',
            periodLabel: '2026-07',
            meta: '校隊',
            amount: 1500
          }
        ],
        formatCurrency: (amount: number) => `NT$${amount}`
      },
      global: {
        stubs: {
          'el-switch': true
        }
      }
    })

    expect(wrapper.text()).toContain('小明 的可用餘額')
    expect(wrapper.text()).toContain('7 月月費')
    expect(wrapper.text()).toContain('2026-07｜校隊')
    expect(wrapper.text()).toContain('NT$1500')
    expect(wrapper.text()).toContain('NT$200')
    expect(wrapper.text()).toContain('NT$1300')
    expect(wrapper.text()).toContain('NT$300')
  })

  it('emits max deduction when enabling the balance switch', async () => {
    const wrapper = mount(PaymentSubmissionSummary, {
      props: {
        totalAmount: 300,
        availableBalance: 500,
        balanceAmount: 0,
        lineItems: [],
        formatCurrency: (amount: number) => `$${amount}`
      },
      global: {
        stubs: {
          'el-switch': {
            props: ['modelValue'],
            emits: ['update:modelValue'],
            template: '<button data-testid="switch" @click="$emit(\'update:modelValue\', true)">switch</button>'
          }
        }
      }
    })

    await wrapper.find('[data-testid="switch"]').trigger('click')

    expect(wrapper.emitted('update:balanceAmount')).toEqual([[300]])
  })
})
