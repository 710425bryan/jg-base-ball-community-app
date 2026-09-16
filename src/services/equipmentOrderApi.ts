import { supabase } from '@/services/supabase'

export const fetchEquipmentOrder = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('equipment_display_order')
    .select('equipment_id')
    .order('position', { ascending: true })

  if (error) {
    // Keep the existing catalog usable while the migration is being rolled out.
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return (data || []).map((row) => row.equipment_id)
}

export const saveEquipmentOrder = async (equipmentIds: string[], expectedIds: string[]): Promise<void> => {
  const { error } = await supabase.rpc('reorder_equipment', {
    p_equipment_ids: equipmentIds,
    p_expected_equipment_ids: expectedIds
  })
  if (error) {
    if (error.code === 'PGRST202') throw new Error('排序功能尚未啟用，請先部署裝備排序資料庫更新。')
    throw error
  }
}
