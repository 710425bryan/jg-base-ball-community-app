// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PaymentMemberSelector from './PaymentMemberSelector.vue'
import type { MyPaymentMember } from '@/types/payments'

const members: MyPaymentMember[] = [
  {
    member_id: 'member-1',
    name: '王　小明',
    role: '校隊',
    billing_mode: 'monthly',
    training_program: 'headquarters',
    training_program_label: '中港總部',
    is_linked: true
  },
  {
    member_id: 'member-2',
    name: '陳小華',
    role: '球員',
    billing_mode: 'quarterly',
    is_linked: false
  }
]

const inputFocus = vi.fn()

const ElSelectStub = {
  name: 'ElSelect',
  inheritAttrs: false,
  props: ['modelValue'],
  emits: ['update:modelValue', 'visible-change'],
  template: `
    <div v-bind="$attrs">
      <slot name="label" :value="modelValue" />
      <slot name="header" />
      <slot />
      <slot name="empty" />
    </div>
  `
}

const ElInputStub = {
  name: 'ElInput',
  inheritAttrs: false,
  props: ['modelValue', 'size', 'prefixIcon', 'clearable', 'autocomplete', 'placeholder', 'ariaLabel'],
  emits: ['update:modelValue'],
  methods: {
    focus: inputFocus
  },
  template: `
    <input
      v-bind="$attrs"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `
}

const ElOptionStub = {
  name: 'ElOption',
  inheritAttrs: false,
  props: ['label', 'value'],
  template: '<div v-bind="$attrs" :data-value="value">{{ label }}</div>'
}

const mountSelector = () => mount(PaymentMemberSelector, {
  props: {
    modelValue: 'member-1',
    members,
    helperText: '切換成員後會更新繳費資料。',
    getOptionLabel: (member: MyPaymentMember) => `${member.name}｜${member.role}`,
    getBillingLabel: (member: MyPaymentMember) => member.billing_mode === 'monthly' ? '月繳' : '季繳'
  },
  global: {
    stubs: {
      'el-select': ElSelectStub,
      'el-input': ElInputStub,
      'el-option': ElOptionStub
    }
  }
})

describe('PaymentMemberSelector', () => {
  beforeEach(() => {
    inputFocus.mockClear()
  })

  it('filters mobile results with normalized Chinese name spacing', async () => {
    const wrapper = mountSelector()
    const mobileSelect = wrapper.find('[data-test="payment-member-mobile-select"]')

    await wrapper.find('[data-test="payment-member-mobile-search"]').setValue('王小明')
    await nextTick()

    const options = mobileSelect.findAll('[data-test="payment-member-option"]')
    expect(options).toHaveLength(1)
    expect(options[0].attributes('data-value')).toBe('member-1')
  })

  it('searches mobile members by training program metadata', async () => {
    const wrapper = mountSelector()
    const mobileSelect = wrapper.find('[data-test="payment-member-mobile-select"]')

    await wrapper.find('[data-test="payment-member-mobile-search"]').setValue('中港總部')
    await nextTick()

    const options = mobileSelect.findAll('[data-test="payment-member-option"]')
    expect(options).toHaveLength(1)
    expect(options[0].attributes('data-value')).toBe('member-1')
  })

  it('restores the complete member list after the mobile picker closes', async () => {
    const wrapper = mountSelector()
    const selects = wrapper.findAllComponents(ElSelectStub)
    const mobileSelect = wrapper.find('[data-test="payment-member-mobile-select"]')

    await wrapper.find('[data-test="payment-member-mobile-search"]').setValue('找不到')
    await nextTick()
    expect(mobileSelect.findAll('[data-test="payment-member-option"]')).toHaveLength(0)

    selects[0].vm.$emit('visible-change', false)
    await nextTick()

    expect(mobileSelect.findAll('[data-test="payment-member-option"]')).toHaveLength(2)
  })

  it('focuses the dedicated search field when the mobile picker opens', async () => {
    const wrapper = mountSelector()
    const selects = wrapper.findAllComponents(ElSelectStub)

    selects[0].vm.$emit('visible-change', true)
    await nextTick()

    expect(inputFocus).toHaveBeenCalledOnce()
  })

  it('emits the selected member id from both responsive selectors', () => {
    const wrapper = mountSelector()
    const selects = wrapper.findAllComponents(ElSelectStub)

    selects[0].vm.$emit('update:modelValue', 'member-2')
    selects[1].vm.$emit('update:modelValue', 'member-1')

    expect(wrapper.emitted('update:modelValue')).toEqual([
      ['member-2'],
      ['member-1']
    ])
  })
})
