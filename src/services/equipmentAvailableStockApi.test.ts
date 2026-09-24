import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({rpc:vi.fn(),uploadEquipmentImages:vi.fn()}))
vi.mock('@/services/supabase', () => ({supabase:{rpc:mocks.rpc}}))
vi.mock('@/services/equipmentApi', () => ({uploadEquipmentImages:mocks.uploadEquipmentImages}))
import { saveEquipmentAvailableStock } from './equipmentAvailableStockApi'
import type { EquipmentAvailableFormPayload } from '@/types/equipment'
describe('saveEquipmentAvailableStock', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.uploadEquipmentImages.mockResolvedValue(['new.jpg']); mocks.rpc.mockResolvedValue({data:'hat',error:null}) })
  const payload = {name:'帽子',category:'服飾類',image_urls:['old.jpg'], stock:{available_quantity:0,sizes:[{size:'S',quantity:0}]},stock_reason:'盤點'} as EquipmentAvailableFormPayload
  it('sends desired availability and the original revision through the atomic RPC', async () => {
    expect(await saveEquipmentAvailableStock(payload,{id:'hat',expectedUpdatedAt:'2026-09-24T01:00:00Z'})).toBe('hat')
    expect(mocks.rpc).toHaveBeenCalledWith('save_equipment_available_stock', {
      p_equipment_id:'hat',p_expected_updated_at:'2026-09-24T01:00:00Z',p_stock:payload.stock,p_reason:'盤點',
      p_details:{name:'帽子',category:'服飾類',image_url:'old.jpg',image_urls:['old.jpg','new.jpg']}
    })
  })
  it('fails closed when the new migration is missing and propagates stale stock errors', async () => {
    mocks.rpc.mockResolvedValueOnce({error:{code:'PGRST202'}})
    await expect(saveEquipmentAvailableStock(payload)).rejects.toThrow('尚未部署')
    mocks.rpc.mockResolvedValueOnce({error:new Error('庫存已變更')})
    await expect(saveEquipmentAvailableStock(payload)).rejects.toThrow('庫存已變更')
  })
})
