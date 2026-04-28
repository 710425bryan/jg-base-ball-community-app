// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MatchLineupTab from '../MatchLineupTab.vue'

const ElButtonStub = {
  props: ['disabled', 'loading'],
  emits: ['click'],
  template: '<button :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>'
}

const makeWrapper = () => mount(MatchLineupTab, {
  props: {
    lineup: [],
    photoUrl: 'https://example.com/match.jpg',
    positions: [],
    getAvailableLineupPlayers: () => [],
    handlePlayerChange: vi.fn()
  },
  global: {
    stubs: {
      ElButton: ElButtonStub,
      ElIcon: { template: '<span><slot /></span>' },
      ElCollapseTransition: { template: '<div><slot /></div>' },
      ElInputNumber: true,
      ElSelect: true,
      ElOption: true,
      ElInput: true,
      ArrowDown: true,
      Camera: true,
      Delete: true,
      List: true,
      Picture: true,
      Plus: true
    }
  }
})

describe('MatchLineupTab', () => {
  it('shows scan and add actions in the header', () => {
    const wrapper = makeWrapper()

    expect(wrapper.text()).toContain('攻守名單')
    expect(wrapper.text()).toContain('解析賽事照片')
    expect(wrapper.text()).toContain('匯入書面名單')
    expect(wrapper.text()).toContain('新增打者')
  })

  it('emits header action events', async () => {
    const wrapper = makeWrapper()
    const buttons = wrapper.findAll('button')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')

    expect(wrapper.emitted('scanExisting')).toHaveLength(1)
    expect(wrapper.emitted('triggerScan')).toHaveLength(1)
    expect(wrapper.emitted('addPlayer')).toHaveLength(1)
  })
})
