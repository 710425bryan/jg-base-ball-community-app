// @vitest-environment jsdom

import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MyLeaveMemberSelector from './MyLeaveMemberSelector.vue'

const ElSelectStub = defineComponent({
  name: 'ElSelectStub',
  props: {
    modelValue: { type: String, default: '' },
    filterable: { type: Boolean, default: false }
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () => h('select', {
      'data-test': 'stub-member-select',
      value: props.modelValue,
      onChange: (event: Event) => emit(
        'update:modelValue',
        (event.target as HTMLSelectElement).value
      )
    }, slots.default?.())
  }
})

const ElOptionStub = defineComponent({
  name: 'ElOptionStub',
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true }
  },
  setup(props) {
    return () => h('option', { value: props.value }, props.label)
  }
})

const members = [
  {
    member_id: 'linked-member',
    name: '王小明',
    role: '校隊',
    training_program_label: '中港總部',
    is_linked: true
  },
  {
    member_id: 'admin-member',
    name: '陳小華',
    role: '球員',
    team_group: '熊隊',
    is_linked: false
  }
]

const mountSelector = (inputMembers = members) => mount(MyLeaveMemberSelector, {
  props: {
    members: inputMembers,
    modelValue: inputMembers[0]?.member_id || ''
  },
  global: {
    stubs: {
      'el-select': ElSelectStub,
      'el-option': ElOptionStub
    }
  }
})

describe('MyLeaveMemberSelector', () => {
  it('shows ADMIN all-member guidance and keeps the full roster searchable', async () => {
    const wrapper = mountSelector()

    expect(wrapper.get('[data-test="leave-member-helper"]').text()).toContain('ADMIN 可切換所有有效成員')
    expect(wrapper.findComponent(ElSelectStub).props('filterable')).toBe(true)
    expect(wrapper.findAll('option').map((option) => option.text())).toEqual([
      '王小明｜中港總部',
      '陳小華｜熊隊'
    ])

    await wrapper.get('[data-test="leave-member-select"]').setValue('admin-member')

    expect(wrapper.emitted('update:modelValue')).toEqual([['admin-member']])
  })

  it('keeps linked-member guidance for a regular account', () => {
    const wrapper = mountSelector([members[0]])

    expect(wrapper.get('[data-test="leave-member-helper"]').text()).toContain('關聯成員')
    expect(wrapper.text()).not.toContain('ADMIN 可切換')
  })
})
