// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import EquipmentCatalogList from './EquipmentCatalogList.vue'
import type { Equipment } from '@/types/equipment'

const equipments = [
  { id: 'b', name: '球棒', image_urls: [], sizes_stock: [], purchase_price: 500 },
  { id: 'a', name: '球衣', image_urls: [], sizes_stock: [], purchase_price: 300 }
] as unknown as Equipment[]

describe('EquipmentCatalogList', () => {
  for (const viewMode of ['grid', 'table'] as const) {
    it(`preserves order and read-only history access in ${viewMode}`, async () => {
      const wrapper = mount(EquipmentCatalogList, {
        props: { equipments, viewMode, canEdit: false, canCreate: false, canDelete: false },
        global: { stubs: { ElIcon: true, ElDropdownItem: true, EquipmentPhotoCarousel: true, AppActionOverflow: true } }
      })
      const rows = wrapper.findAll(viewMode === 'grid' ? 'article' : 'tbody tr')
      expect(rows[0].text()).toContain('球棒')
      expect(rows[1].text()).toContain('球衣')
      expect(wrapper.text()).not.toContain('減少庫存')
      await rows[0].get('button').trigger('click')
      expect(wrapper.emitted('history')).toEqual([[equipments[0]]])
    })
    it(`forwards editor inventory actions in ${viewMode}`, async () => {
      const wrapper = mount(EquipmentCatalogList, {
        props: { equipments, viewMode, canEdit: true, canCreate: false, canDelete: false },
        global: { stubs: {
          ElIcon: true, EquipmentPhotoCarousel: true,
          AppActionOverflow: { template: '<div><slot /></div>' },
          ElDropdownItem: { template: '<button><slot /></button>' }
        } }
      })
      const stockOut = wrapper.findAll('button').find(button => button.text().includes('減少庫存'))!
      await stockOut.trigger('click')
      expect(wrapper.emitted('inventory')).toEqual([[equipments[0], 'stock_out']])
    })
  }
})
