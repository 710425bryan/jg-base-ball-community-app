// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EquipmentTransactionDialog from './EquipmentTransactionDialog.vue'
import type { Equipment } from '@/types/equipment'
vi.mock('@/stores/equipment', () => ({useEquipmentStore:() => ({members:[],loadTransactions:vi.fn().mockResolvedValue([])})}))
describe('EquipmentTransactionDialog stock summary', () => {
  it('shows availability after existing allocations and reservations', () => {
    const wrapper = mount(EquipmentTransactionDialog, {
      props:{modelValue:true,equipment:{id:'hat',name:'帽子',category:'服飾類',total_quantity:10,sizes_stock:[],inventory_snapshot:[{equipment_id:'hat',size:null,used_quantity:2,reserved_quantity:3}]} as unknown as Equipment},
      global:{plugins:[ElementPlus],stubs:{ElDialog:{template:'<div><slot /></div>'},ElForm:{template:'<div><slot /></div>'},ElFormItem:true,ElIcon:true}}
    })
    expect(wrapper.text()).toContain('可用庫存 5 件')
    expect(wrapper.text()).not.toContain('總數量')
    wrapper.unmount()
  })
})
