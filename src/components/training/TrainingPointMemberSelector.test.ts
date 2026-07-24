// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import TrainingPointMemberSelector from './TrainingPointMemberSelector.vue'

const members = [
  {
    id: 'member-1',
    name: '王　小明',
    role: '校隊',
    team_group: 'U12 熊戰組'
  },
  {
    id: 'member-2',
    name: '陳小華',
    role: '球員',
    team_group: 'U10 熊萌組'
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

const mountSelector = () => mount(TrainingPointMemberSelector, {
  props: {
    modelValue: ['member-2'],
    members
  },
  global: {
    stubs: {
      'el-select': ElSelectStub,
      'el-option': ElOptionStub
    }
  }
})

describe('TrainingPointMemberSelector', () => {
  it('uses one searchable select and filters normalized Chinese name spacing', async () => {
    const wrapper = mountSelector()
    const select = wrapper.getComponent(ElSelectStub)

    expect(wrapper.findAllComponents(ElSelectStub)).toHaveLength(1)
    select.props('filterMethod')('王小明')
    await nextTick()

    const options = wrapper.findAll('[data-test="training-point-member-option"]')
    expect(options).toHaveLength(1)
    expect(options[0].attributes('data-value')).toBe('member-1')
  })

  it('searches members across role and group terms', async () => {
    const wrapper = mountSelector()
    const select = wrapper.getComponent(ElSelectStub)

    select.props('filterMethod')('校隊 U12')
    await nextTick()

    const options = wrapper.findAll('[data-test="training-point-member-option"]')
    expect(options).toHaveLength(1)
    expect(options[0].attributes('data-value')).toBe('member-1')
  })

  it('restores the complete roster after the picker closes', async () => {
    const wrapper = mountSelector()
    const select = wrapper.getComponent(ElSelectStub)

    select.props('filterMethod')('不存在')
    await nextTick()
    expect(wrapper.findAll('[data-test="training-point-member-option"]')).toHaveLength(0)

    select.vm.$emit('visible-change', false)
    await nextTick()

    expect(wrapper.findAll('[data-test="training-point-member-option"]')).toHaveLength(2)
  })

  it('emits the selected member ids', () => {
    const wrapper = mountSelector()
    const select = wrapper.getComponent(ElSelectStub)

    select.vm.$emit('update:modelValue', ['member-1', 'member-2'])

    expect(wrapper.emitted('update:modelValue')).toEqual([
      [['member-1', 'member-2']]
    ])
  })
})
