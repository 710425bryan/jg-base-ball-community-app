// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EquipmentRequestQuantitySummary from './EquipmentRequestQuantitySummary.vue'
import type { EquipmentRequestQuantitySummaryRow } from '@/utils/equipmentPurchaseAdmin'

const rows: EquipmentRequestQuantitySummaryRow[] = [
  {
    key: 'cap-m',
    equipmentId: 'equipment-1',
    equipmentName: '球帽',
    size: 'M',
    jerseyNumber: null,
    requestCount: 2,
    totalQuantity: 7
  },
  {
    key: 'jersey-12',
    equipmentId: 'equipment-2',
    equipmentName: '球衣',
    size: 'L',
    jerseyNumber: 12,
    requestCount: 1,
    totalQuantity: 1
  }
]

describe('EquipmentRequestQuantitySummary', () => {
  it('starts collapsed and reveals all filtered variants and totals when expanded', async () => {
    const wrapper = mount(EquipmentRequestQuantitySummary, {
      props: { rows },
      global: {
        stubs: {
          'el-icon': { template: '<span><slot /></span>' }
        }
      }
    })

    const content = wrapper.get('#equipment-request-quantity-summary')
    expect(content.attributes('style')).toContain('display: none')
    expect(wrapper.get('button[aria-controls="equipment-request-quantity-summary"]').attributes('aria-label')).toBe('展開請購數量統計')
    expect(wrapper.text()).toContain('共 2 種規格、8 件')
    expect(wrapper.findAll('[role="row"]')).toHaveLength(3)
    expect(wrapper.text()).toContain('球帽')
    expect(wrapper.text()).toContain('尺寸 M｜無背號')
    expect(wrapper.text()).toContain('7 件')
    expect(wrapper.text()).toContain('2 筆請購')
    expect(wrapper.text()).toContain('背號 12')

    await wrapper.get('button[aria-controls="equipment-request-quantity-summary"]').trigger('click')
    expect(content.attributes('style') || '').not.toContain('display: none')
    expect(wrapper.get('button[aria-controls="equipment-request-quantity-summary"]').attributes('aria-label')).toBe('收合請購數量統計')
  })

  it('shows an explicit empty state', async () => {
    const wrapper = mount(EquipmentRequestQuantitySummary, {
      props: { rows: [] },
      global: { stubs: { 'el-icon': true } }
    })

    expect(wrapper.text()).toContain('目前沒有可統計的請購品項')
  })

  it('uses a desktop table header and compact mobile row details', () => {
    const wrapper = mount(EquipmentRequestQuantitySummary, {
      props: { rows },
      global: { stubs: { 'el-icon': true } }
    })

    expect(wrapper.get('[role="table"]').attributes('aria-label')).toBe('請購裝備數量統計')
    expect(wrapper.findAll('[role="columnheader"]')).toHaveLength(5)
    expect(wrapper.get('[role="columnheader"]').element.parentElement?.className).toContain('md:grid')
    expect(wrapper.find('.md\\:hidden').exists()).toBe(true)
  })
})
