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
    it(`shows only available stock in ${viewMode} and explains inconsistent data`, () => {
      const hat = {...equipments[0],total_quantity:9,sizes_stock:[{size:'S',quantity:1},{size:'M',quantity:8}],inventory_snapshot:[
        {equipment_id:'b',size:'S',used_quantity:1,reserved_quantity:0},
        {equipment_id:'b',size:'M',used_quantity:2,reserved_quantity:2}
      ]}
      const wrapper = mount(EquipmentCatalogList, {props:{equipments:[hat],viewMode,canEdit:false,canCreate:false,canDelete:false}, global:{stubs:{ElIcon:true,ElDropdownItem:true}}})
      expect(wrapper.text()).toContain('可用庫存')
      expect(wrapper.text()).toContain('S：0 件')
      expect(wrapper.text()).toContain('M：4 件')
      expect(wrapper.text()).not.toContain('總量')
      expect(wrapper.text()).not.toContain('0/1')
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
      wrapper.unmount()
    })
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
