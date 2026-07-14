// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import LeaveMemberPicker from './LeaveMemberPicker.vue'

const members = [
  {
    id: 'member-1',
    name: '王小明',
    role: '球員',
    team_group: 'U12熊戰組',
    jersey_number: '10'
  },
  {
    id: 'member-2',
    name: '陳大華',
    role: '校隊',
    team_group: '校隊',
    jersey_number: '18'
  }
]

describe('LeaveMemberPicker', () => {
  it('filters mobile member options and emits a direct selection', async () => {
    const wrapper = mount(LeaveMemberPicker, {
      props: {
        modelValue: '',
        members,
        open: true
      }
    })

    await wrapper.get('input[aria-label="搜尋請假球員"]').setValue('王 U12 #10')

    const options = wrapper.findAll('[data-test="leave-member-option"]')
    expect(options).toHaveLength(1)
    expect(options[0].text()).toContain('王小明')

    await options[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['member-1']])
  })

  it('shows a clear empty result instead of leaving an unchanged list', async () => {
    const wrapper = mount(LeaveMemberPicker, {
      props: {
        modelValue: '',
        members,
        open: true
      }
    })

    await wrapper.get('input[aria-label="搜尋請假球員"]').setValue('不存在')

    expect(wrapper.findAll('[data-test="leave-member-option"]')).toHaveLength(0)
    expect(wrapper.get('[data-test="leave-member-empty"]').text()).toContain('找不到')
  })
})
