// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { ElOption } from 'element-plus'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import AppGlobalSelect from '@/components/common/AppGlobalSelect.vue'
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

const ElSelectStub = {
  name: 'ElSelect',
  inheritAttrs: false,
  props: ['modelValue', 'filterMethod'],
  emits: ['update:modelValue', 'visible-change'],
  template: `
    <div v-bind="$attrs">
      <slot />
      <slot name="empty" />
    </div>
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
      'el-option': ElOptionStub
    }
  }
})

describe('PaymentMemberSelector', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('uses one searchable select and filters normalized Chinese name spacing', async () => {
    const wrapper = mountSelector()
    const select = wrapper.getComponent(ElSelectStub)

    expect(wrapper.findAllComponents(ElSelectStub)).toHaveLength(1)
    select.props('filterMethod')('王小明')
    await nextTick()

    const options = wrapper.findAll('[data-test="payment-member-option"]')
    expect(options).toHaveLength(1)
    expect(options[0].attributes('data-value')).toBe('member-1')
  })

  it('searches members by training program metadata', async () => {
    const wrapper = mountSelector()
    const select = wrapper.getComponent(ElSelectStub)

    select.props('filterMethod')('中港總部')
    await nextTick()

    const options = wrapper.findAll('[data-test="payment-member-option"]')
    expect(options).toHaveLength(1)
    expect(options[0].attributes('data-value')).toBe('member-1')
  })

  it('restores the complete member list after the picker closes', async () => {
    const wrapper = mountSelector()
    const select = wrapper.getComponent(ElSelectStub)

    select.props('filterMethod')('找不到')
    await nextTick()
    expect(wrapper.findAll('[data-test="payment-member-option"]')).toHaveLength(0)

    select.vm.$emit('visible-change', false)
    await nextTick()

    expect(wrapper.findAll('[data-test="payment-member-option"]')).toHaveLength(2)
  })

  it('emits the selected member id', () => {
    const wrapper = mountSelector()
    const select = wrapper.getComponent(ElSelectStub)

    select.vm.$emit('update:modelValue', 'member-2')

    expect(wrapper.emitted('update:modelValue')).toEqual([
      ['member-2']
    ])
  })

  it('filters the real select while a mobile Chinese IME is still composing', async () => {
    const wrapper = mount(PaymentMemberSelector, {
      props: {
        modelValue: 'member-1',
        members,
        helperText: '切換成員後會更新繳費資料。',
        getOptionLabel: (member: MyPaymentMember) => `${member.name}｜${member.role}`,
        getBillingLabel: (member: MyPaymentMember) => member.billing_mode === 'monthly' ? '月繳' : '季繳'
      },
      global: {
        components: {
          'el-select': AppGlobalSelect,
          'el-option': ElOption
        }
      }
    })
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '陳' }))
    input.value = '陳'
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: '陳',
      inputType: 'insertCompositionText',
      isComposing: true
    }))
    await nextTick()

    const options = wrapper.findAllComponents(ElOption)
    expect(options).toHaveLength(1)
    expect(options[0].props('value')).toBe('member-2')
    expect(input.value).toBe('陳')

    wrapper.unmount()
  })

  it('filters the real select when iOS ends composition without an input event', async () => {
    const wrapper = mount(PaymentMemberSelector, {
      props: {
        modelValue: 'member-1',
        members,
        helperText: '切換成員後會更新繳費資料。',
        getOptionLabel: (member: MyPaymentMember) => `${member.name}｜${member.role}`,
        getBillingLabel: (member: MyPaymentMember) => member.billing_mode === 'monthly' ? '月繳' : '季繳'
      },
      global: {
        components: {
          'el-select': AppGlobalSelect,
          'el-option': ElOption
        }
      }
    })
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    input.value = '陳'
    input.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: '陳'
    }))
    await nextTick()

    const options = wrapper.findAllComponents(ElOption)
    expect(options).toHaveLength(1)
    expect(options[0].props('value')).toBe('member-2')
    expect(input.value).toBe('陳')

    wrapper.unmount()
  })

  it('filters the real select when the focused input value changes without text events', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PaymentMemberSelector, {
      attachTo: document.body,
      props: {
        modelValue: 'member-1',
        members,
        helperText: '切換成員後會更新繳費資料。',
        getOptionLabel: (member: MyPaymentMember) => `${member.name}｜${member.role}`,
        getBillingLabel: (member: MyPaymentMember) => member.billing_mode === 'monthly' ? '月繳' : '季繳'
      },
      global: {
        components: {
          'el-select': AppGlobalSelect,
          'el-option': ElOption
        }
      }
    })
    const input = wrapper.get('input.el-select__input').element as HTMLInputElement

    input.focus()
    await nextTick()
    input.value = '陳'
    await vi.advanceTimersByTimeAsync(60)
    await nextTick()

    const options = wrapper.findAllComponents(ElOption)
    expect(options).toHaveLength(1)
    expect(options[0].props('value')).toBe('member-2')
    expect(input.value).toBe('陳')

    wrapper.unmount()
  })
})
