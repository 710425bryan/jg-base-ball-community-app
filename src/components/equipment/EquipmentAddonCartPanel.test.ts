// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EquipmentAddonCartPanel from './EquipmentAddonCartPanel.vue'
import type { Equipment } from '@/types/equipment'

const equipment = {
  id: 'equipment-1',
  name: '客製球衣',
  purchase_price: 1200,
  is_custom_order: true,
  requires_jersey_number: false
} as Equipment

const inputNumberStub = {
  props: ['modelValue', 'ariaLabel'],
  emits: ['update:modelValue'],
  template: '<button type="button" :aria-label="ariaLabel" @click="$emit(\'update:modelValue\', 3)">數量 {{ modelValue }}</button>'
}

const inputStub = {
  props: ['modelValue', 'ariaLabel'],
  emits: ['update:modelValue'],
  template: '<textarea :aria-label="ariaLabel" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
}

const mountPanel = () => mount(EquipmentAddonCartPanel, {
  props: {
    items: [{
      equipment_id: equipment.id,
      size: 'L',
      jersey_number: null,
      quantity: 2,
      equipment,
      availabilityFailure: {
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        size: 'L',
        requestedQuantity: 2,
        availableQuantity: 1,
        reason: '客製球衣（L）可用數量只剩 1 件'
      }
    }],
    note: '原始備註',
    total: 2400,
    availabilityMessage: '部分裝備庫存不足',
    hasCustomOrderItems: true
  },
  global: {
    stubs: {
      'el-input-number': inputNumberStub,
      'el-input': inputStub
    }
  }
})

describe('EquipmentAddonCartPanel', () => {
  it('renders items, variants, totals, custom-order hints and inventory errors', () => {
    const wrapper = mountPanel()

    expect(wrapper.text()).toContain('客製球衣')
    expect(wrapper.text()).toContain('L')
    expect(wrapper.text()).toContain('$2,400')
    expect(wrapper.text()).toContain('訂製品｜需等待備貨')
    expect(wrapper.text()).toContain('客製球衣（L）可用數量只剩 1 件')
    expect(wrapper.text()).toContain('清單含訂製品')
  })

  it('emits note, quantity and remove changes without owning the draft state', async () => {
    const wrapper = mountPanel()

    await wrapper.get('textarea').setValue('新的備註')
    await wrapper.get('button[aria-label="客製球衣數量"]').trigger('click')
    await wrapper.get('button[aria-label="移除客製球衣"]').trigger('click')

    expect(wrapper.emitted('update:note')?.[0]).toEqual(['新的備註'])
    expect(wrapper.emitted('update-quantity')?.[0]).toEqual([0, 3])
    expect(wrapper.emitted('remove')?.[0]).toEqual([0])
  })

  it('shows invalid quantity before the aggregate availability message', () => {
    const wrapper = mount(EquipmentAddonCartPanel, {
      props: {
        items: [],
        note: '',
        total: 0,
        hasInvalidQuantity: true,
        availabilityMessage: '庫存不足'
      },
      global: { stubs: { 'el-input': inputStub, 'el-input-number': true } }
    })

    expect(wrapper.text()).toContain('大於 0 的數量')
    expect(wrapper.text()).not.toContain('庫存不足')
  })
})
