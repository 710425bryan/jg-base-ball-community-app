// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { ElOption, ElSelect } from 'element-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import AppGlobalSelect from '@/components/common/AppGlobalSelect.vue'
import PlayerBalanceManager from './PlayerBalanceManager.vue'

const listPlayerBalancesMock = vi.hoisted(() => vi.fn())
const listPlayerBalanceTransactionsMock = vi.hoisted(() => vi.fn())
const adjustPlayerBalanceMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/playerBalances', () => ({
  listPlayerBalances: listPlayerBalancesMock,
  listPlayerBalanceTransactions: listPlayerBalanceTransactionsMock,
  adjustPlayerBalance: adjustPlayerBalanceMock
}))

vi.mock('@/stores/permissions', () => ({
  usePermissionsStore: () => ({
    can: () => false
  })
}))

const InlineGlobalSelect = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h(AppGlobalSelect, {
      ...attrs,
      teleported: false
    }, slots)
  }
})

describe('PlayerBalanceManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    listPlayerBalancesMock.mockResolvedValue([
      { member_id: 'member-1', member_name: '陳柏叡', role: '校隊', balance_amount: 0, is_linked: false },
      { member_id: 'member-2', member_name: '田小明', role: '校隊', balance_amount: 0, is_linked: false },
      { member_id: 'member-3', member_name: '丁郁宸', role: '校隊', balance_amount: 0, is_linked: false }
    ])
    listPlayerBalanceTransactionsMock.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('syncs the open balance member query even without focus or text events', async () => {
    const wrapper = mount(PlayerBalanceManager, {
      attachTo: document.body,
      global: {
        components: {
          'el-select': InlineGlobalSelect,
          'el-option': ElOption,
          'el-input-number': { template: '<div />' },
          'el-input': { template: '<div />' }
        },
        stubs: {
          teleport: true,
          'el-icon': true
        }
      }
    })

    await flushPromises()
    const globalSelect = wrapper.getComponent(AppGlobalSelect)
    const select = globalSelect.getComponent(ElSelect)
    const input = globalSelect.get('input.el-select__input').element as HTMLInputElement

    select.vm.toggleMenu()
    await nextTick()
    input.value = '田'
    await vi.advanceTimersByTimeAsync(60)
    await nextTick()

    expect((select.vm as any).states.inputValue).toBe('田')
    expect(input.value).toBe('田')

    wrapper.unmount()
  })
})
