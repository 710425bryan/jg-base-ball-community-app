import { supabase } from '@/services/supabase'
import { uploadEquipmentImages } from '@/services/equipmentApi'
import type { EquipmentAvailableFormPayload } from '@/types/equipment'

export const saveEquipmentAvailableStock = async (
  payload: EquipmentAvailableFormPayload,
  options: { id?: string | null; expectedUpdatedAt?: string | null; imageFiles?: File[] } = {}
) => {
  const { stock, stock_reason, ...details } = payload
  const uploaded = await uploadEquipmentImages(options.imageFiles || [])
  const images = [...new Set([...(details.image_urls || []), ...uploaded])]
  const { data, error } = await supabase.rpc('save_equipment_available_stock', {
    p_equipment_id: options.id || null,
    p_details: { ...details, image_url: images[0] || null, image_urls: images },
    p_stock: stock,
    p_expected_updated_at: options.expectedUpdatedAt || null,
    p_reason: stock_reason
  })
  // Never fall back to writing available quantities into the legacy total columns.
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('可用庫存功能尚未部署，請先更新資料庫後再儲存。')
    }
    throw error
  }
  return String(data)
}
