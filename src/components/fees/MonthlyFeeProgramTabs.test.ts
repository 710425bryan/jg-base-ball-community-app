// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MonthlyFeeProgramTabs from './MonthlyFeeProgramTabs.vue'

const options = [
  { value: 'chunggang_school_team', label: '中港總部', memberCount: 8 },
  { value: 'junior_high_school_team', label: '國中部', memberCount: 5 }
]

describe('MonthlyFeeProgramTabs', () => {
  it('renders two accessible program tabs with member counts', () => {
    const wrapper = mount(MonthlyFeeProgramTabs, {
      props: {
        modelValue: 'chunggang_school_team',
        options
      }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs).toHaveLength(2)
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[0].attributes('aria-controls')).toBe('monthly-fee-program-panel')
    expect(tabs[0].text()).toContain('中港總部')
    expect(tabs[0].text()).toContain('8 人')
    expect(tabs[1].text()).toContain('國中部')
    expect(tabs[1].text()).toContain('5 人')
  })

  it('emits the selected program key', async () => {
    const wrapper = mount(MonthlyFeeProgramTabs, {
      props: {
        modelValue: 'chunggang_school_team',
        options
      }
    })

    await wrapper.findAll('[role="tab"]')[1].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['junior_high_school_team']])
  })
})
