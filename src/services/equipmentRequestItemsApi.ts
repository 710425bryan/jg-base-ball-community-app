import { fetchEquipmentRequestById, uploadEquipmentImages } from '@/services/equipmentApi'
import { supabase } from '@/services/supabase'
import type { EquipmentPurchaseRequest } from '@/types/equipment'

const fetchUpdatedRequest = async (requestId: string) => {
  const request = await fetchEquipmentRequestById(requestId)
  if (!request) throw new Error('找不到加購申請')
  return request
}

export const markEquipmentRequestItemReady = async (
  requestId: string,
  requestItemId: string,
  userId: string,
  note?: string | null,
  imageFiles: File[] = []
) => {
  const imageUrls = await uploadEquipmentImages(
    imageFiles,
    `equipment_request_actions/items/${requestItemId}/ready`
  )
  const { error } = await supabase.rpc('mark_equipment_request_item_ready', {
    p_request_item_id: requestItemId,
    p_user_id: userId,
    p_note: note || null,
    p_image_urls: imageUrls
  })

  if (error) throw error
  return fetchUpdatedRequest(requestId)
}

export const markEquipmentRequestItemPickedUp = async (
  requestId: string,
  requestItemId: string,
  userId: string,
  note?: string | null,
  imageFiles: File[] = [],
  markPaid = false
) => {
  const imageUrls = await uploadEquipmentImages(
    imageFiles,
    `equipment_request_actions/items/${requestItemId}/pickup`
  )
  const { error } = await supabase.rpc('mark_equipment_request_item_picked_up', {
    p_request_item_id: requestItemId,
    p_user_id: userId,
    p_note: note || null,
    p_image_urls: imageUrls,
    p_mark_paid: markPaid
  })

  if (error) throw error
  return fetchUpdatedRequest(requestId)
}

export const deleteEquipmentPurchaseRequestItem = async (
  requestId: string,
  requestItemId: string,
  userId: string
): Promise<EquipmentPurchaseRequest | null> => {
  const { data, error } = await supabase.rpc('delete_equipment_purchase_request_item', {
    p_request_item_id: requestItemId,
    p_user_id: userId
  })

  if (error) throw error

  const result = Array.isArray(data) ? data[0] : data
  if (result?.request_deleted) return null
  return fetchUpdatedRequest(requestId)
}
