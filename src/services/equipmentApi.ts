import { supabase } from '@/services/supabase'
import { compressImage } from '@/utils/imageCompressor'
import { EQUIPMENT_REQUEST_RESERVED_STATUSES } from '@/utils/equipmentRequestStatus'
import { validateEquipmentPurchaseItemsAvailability } from '@/utils/equipmentInventory'
import type {
  CreateEquipmentPaymentSubmissionPayload,
  CreateEquipmentPurchaseRequestPayload,
  Equipment,
  EquipmentFormPayload,
  EquipmentInventoryAdjustment,
  EquipmentInventoryAdjustmentPayload,
  EquipmentManualPurchaseRecord,
  EquipmentMemberSummary,
  EquipmentPendingRequestPaymentItem,
  EquipmentPaymentSubmission,
  EquipmentPurchaseRequest,
  EquipmentRequestHistoryItem,
  EquipmentRequestItem,
  EquipmentTransaction,
  EquipmentTransactionPayload
} from '@/types/equipment'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) return [] as T[]
  return Array.isArray(data) ? data : [data]
}

const unique = (values: Array<string | null | undefined>) => [...new Set(values.filter(Boolean) as string[])]

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeUrlList = (value: unknown, fallback: Array<string | null | undefined> = []) => {
  let values: unknown[] = []

  if (Array.isArray(value)) {
    values = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        values = Array.isArray(parsed) ? parsed : [trimmed]
      } catch {
        values = [trimmed]
      }
    } else if (trimmed) {
      values = [trimmed]
    }
  }

  return unique([
    ...values.map((item) => (typeof item === 'string' ? item.trim() : '')),
    ...fallback.map((item) => (typeof item === 'string' ? item.trim() : ''))
  ])
}

const EQUIPMENT_SELECT = `
  id,
  name,
  category,
  specs,
  notes,
  image_url,
  image_urls,
  purchase_price,
  quick_purchase_enabled,
  total_quantity,
  purchased_by,
  sizes_stock,
  created_at,
  updated_at
`

const EQUIPMENT_INVENTORY_TRANSACTION_SELECT = `
  id,
  equipment_id,
  transaction_type,
  member_id,
  size,
  quantity
`

const normalizeEquipment = (row: any): Equipment => ({
  ...row,
  image_urls: normalizeUrlList(row?.image_urls, [row?.image_url]),
  purchase_price: normalizeNumber(row?.purchase_price),
  total_quantity: normalizeNumber(row?.total_quantity),
  quick_purchase_enabled: Boolean(row?.quick_purchase_enabled),
  sizes_stock: Array.isArray(row?.sizes_stock)
    ? row.sizes_stock.map((item: any) => ({
      size: String(item?.size || '').trim(),
      quantity: normalizeNumber(item?.quantity)
    })).filter((item: any) => item.size)
    : [],
  equipment_transactions: Array.isArray(row?.equipment_transactions)
    ? row.equipment_transactions.map(normalizeTransaction)
    : [],
  inventory_adjustments: Array.isArray(row?.inventory_adjustments)
    ? row.inventory_adjustments.map(normalizeInventoryAdjustment)
    : [],
  reserved_request_items: Array.isArray(row?.reserved_request_items)
    ? row.reserved_request_items.map((item: any) => ({
      ...item,
      quantity: normalizeNumber(item?.quantity),
      unit_price_snapshot: item?.unit_price_snapshot == null ? null : normalizeNumber(item.unit_price_snapshot)
    }))
    : []
})

const normalizeTransaction = (row: any): EquipmentTransaction => ({
  ...row,
  quantity: normalizeNumber(row?.quantity, 1),
  unit_price: row?.unit_price == null ? null : normalizeNumber(row.unit_price)
})

const normalizeInventoryAdjustment = (row: any): EquipmentInventoryAdjustment => ({
  ...row,
  quantity_delta: normalizeNumber(row?.quantity_delta, 1),
  total_quantity_after: normalizeNumber(row?.total_quantity_after),
  sizes_stock_after: Array.isArray(row?.sizes_stock_after)
    ? row.sizes_stock_after.map((item: any) => ({
      size: String(item?.size || '').trim(),
      quantity: normalizeNumber(item?.quantity)
    })).filter((item: any) => item.size)
    : []
})

const normalizePaymentSubmission = (row: any): EquipmentPaymentSubmission => ({
  ...row,
  amount: normalizeNumber(row?.amount),
  items: Array.isArray(row?.items)
    ? row.items.map((item: any) => ({
      ...item,
      quantity: normalizeNumber(item?.quantity),
      unit_price: normalizeNumber(item?.unit_price),
      total_amount: normalizeNumber(item?.total_amount)
    }))
    : []
})

const normalizePendingRequestPaymentItem = (row: any): EquipmentPendingRequestPaymentItem => ({
  ...row,
  quantity: normalizeNumber(row?.quantity),
  unit_price: normalizeNumber(row?.unit_price),
  total_amount: normalizeNumber(row?.total_amount)
})

const normalizeRequestHistoryItem = (row: any): EquipmentRequestHistoryItem => ({
  ...row,
  quantity: normalizeNumber(row?.quantity),
  unit_price: normalizeNumber(row?.unit_price),
  total_amount: normalizeNumber(row?.total_amount)
})

const normalizeManualPurchaseRecord = (row: any): EquipmentManualPurchaseRecord => ({
  ...row,
  quantity: normalizeNumber(row?.quantity),
  unit_price: normalizeNumber(row?.unit_price),
  total_amount: normalizeNumber(row?.total_amount)
})

const buildStoragePath = (folder: string, file: File) => {
  const extension = String(file.name || 'jpg').split('.').pop() || 'jpg'
  const random = Math.random().toString(36).slice(2, 10)
  return `${folder}/${Date.now()}_${random}.${extension}`
}

export const uploadEquipmentImage = async (file: File, folder = 'equipment_images') => {
  const compressedFile = await compressImage(file, 1600, 1200, 0.82, 900_000)
  const filePath = buildStoragePath(folder, compressedFile)

  const { error } = await supabase.storage
    .from('equipments')
    .upload(filePath, compressedFile, { upsert: false })

  if (error) throw error

  const { data } = supabase.storage.from('equipments').getPublicUrl(filePath)
  return data.publicUrl
}

export const uploadEquipmentImages = async (files: File[] = [], folder = 'equipment_images') => {
  const validFiles = files.filter(Boolean)
  if (validFiles.length === 0) return [] as string[]
  return Promise.all(validFiles.map((file) => uploadEquipmentImage(file, folder)))
}

const buildEquipmentImageValues = async (payload: EquipmentFormPayload, imageFiles: File[] = []) => {
  const uploadedImageUrls = await uploadEquipmentImages(imageFiles)
  const imageUrls = normalizeUrlList([
    ...(Array.isArray(payload.image_urls) ? payload.image_urls : []),
    ...(!Array.isArray(payload.image_urls) && payload.image_url ? [payload.image_url] : []),
    ...uploadedImageUrls
  ])

  return {
    image_url: imageUrls[0] || null,
    image_urls: imageUrls
  }
}

const fetchReservedRequestItems = async (equipmentIds: string[] = []) => {
  const scopedEquipmentIds = unique(equipmentIds)
  const { data: requests, error: requestError } = await supabase
    .from('equipment_purchase_requests')
    .select('id')
    .in('status', EQUIPMENT_REQUEST_RESERVED_STATUSES)

  if (requestError) {
    if (requestError.code === '42P01') return []
    throw requestError
  }

  const requestIds = unique((requests || []).map((row: any) => row.id))
  if (requestIds.length === 0) return []

  let query = supabase
    .from('equipment_purchase_request_items')
    .select('id, request_id, equipment_id, size, quantity, unit_price_snapshot')
    .in('request_id', requestIds)
    .is('equipment_transaction_id', null)

  if (scopedEquipmentIds.length > 0) {
    query = query.in('equipment_id', scopedEquipmentIds)
  }

  const { data, error } = await query

  if (error) {
    if (error.code === '42P01') return []
    throw error
  }

  return data || []
}

const groupRowsByEquipmentId = (rows: any[]) => {
  const grouped = new Map<string, any[]>()

  for (const row of rows) {
    const equipmentId = String(row.equipment_id || '')
    if (!equipmentId) continue
    if (!grouped.has(equipmentId)) grouped.set(equipmentId, [])
    grouped.get(equipmentId)?.push(row)
  }

  return grouped
}

const fetchEquipmentInventoryTransactions = async (equipmentIds: string[] = []) => {
  const scopedEquipmentIds = unique(equipmentIds)
  let query = supabase
    .from('equipment_transactions')
    .select(EQUIPMENT_INVENTORY_TRANSACTION_SELECT)

  if (scopedEquipmentIds.length > 0) {
    query = query.in('equipment_id', scopedEquipmentIds)
  }

  const { data, error } = await query
  if (error) throw error

  return data || []
}

export const fetchEquipments = async () => {
  const { data, error } = await supabase
    .from('equipment')
    .select(EQUIPMENT_SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error

  const equipmentIds = (data || []).map((row: any) => row.id)
  const [reservedItems, inventoryTransactions] = await Promise.all([
    fetchReservedRequestItems(equipmentIds),
    fetchEquipmentInventoryTransactions(equipmentIds)
  ])
  const reservedByEquipmentId = groupRowsByEquipmentId(reservedItems)
  const transactionsByEquipmentId = groupRowsByEquipmentId(inventoryTransactions)

  return (data || []).map((row: any) => normalizeEquipment({
    ...row,
    equipment_transactions: transactionsByEquipmentId.get(String(row.id)) || [],
    reserved_request_items: reservedByEquipmentId.get(String(row.id)) || []
  }))
}

export const fetchEquipmentTransactions = async (equipmentId: string) => {
  const { data, error } = await supabase
    .from('equipment_transactions')
    .select(`
      id,
      equipment_id,
      transaction_type,
      transaction_date,
      member_id,
      handled_by,
      size,
      quantity,
      notes,
      unit_price,
      request_item_id,
      carryover_month,
      payment_status,
      payment_submission_id,
      paid_at,
      paid_by,
      created_at,
      updated_at,
      team_members ( name, role )
    `)
    .eq('equipment_id', equipmentId)
    .order('transaction_date', { ascending: false })

  if (error) throw error
  return (data || []).map(normalizeTransaction)
}

export const fetchEquipmentInventoryAdjustments = async (equipmentId: string) => {
  const { data, error } = await supabase
    .from('equipment_inventory_adjustments')
    .select(`
      id,
      equipment_id,
      adjustment_type,
      adjustment_date,
      member_id,
      handled_by,
      size,
      quantity_delta,
      total_quantity_after,
      sizes_stock_after,
      notes,
      created_by,
      created_at,
      updated_at,
      team_members ( name, role )
    `)
    .eq('equipment_id', equipmentId)
    .order('adjustment_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return (data || []).map(normalizeInventoryAdjustment)
}

export const fetchEquipmentRequestHistoryItems = async (equipmentId: string) => {
  const { data: itemRows, error: itemError } = await supabase
    .from('equipment_purchase_request_items')
    .select(`
      id,
      request_id,
      equipment_id,
      size,
      quantity,
      unit_price_snapshot,
      equipment_transaction_id
    `)
    .eq('equipment_id', equipmentId)

  if (itemError) {
    if (itemError.code === '42P01') return [] as EquipmentRequestHistoryItem[]
    throw itemError
  }

  const items = itemRows || []
  const requestIds = unique(items.map((item: any) => item.request_id))
  if (requestIds.length === 0) return [] as EquipmentRequestHistoryItem[]

  const { data: requestRows, error: requestError } = await supabase
    .from('equipment_purchase_requests')
    .select(`
      id,
      member_id,
      status,
      requested_at,
      approved_at,
      ready_at,
      picked_up_at,
      rejected_at,
      cancelled_at
    `)
    .in('id', requestIds)

  if (requestError) throw requestError

  const requestMap = new Map((requestRows || []).map((request: any) => [String(request.id), request]))
  const memberMap = await fetchMembersMap((requestRows || []).map((request: any) => request.member_id))

  return items
    .map((item: any) => {
      const request = requestMap.get(String(item.request_id))
      if (!request) return null

      const requestStatus = String(request.status || '')
      if (item.equipment_transaction_id && requestStatus === 'picked_up') return null

      const member = memberMap.get(String(request.member_id))
      const quantity = normalizeNumber(item.quantity, 1)
      const unitPrice = normalizeNumber(item.unit_price_snapshot)

      return normalizeRequestHistoryItem({
        request_item_id: item.id,
        request_id: item.request_id,
        equipment_id: item.equipment_id,
        member_id: request.member_id,
        member_name: member?.name || '未知成員',
        size: item.size || null,
        quantity,
        unit_price: unitPrice,
        total_amount: unitPrice * quantity,
        request_status: requestStatus,
        requested_at: request.requested_at,
        approved_at: request.approved_at,
        ready_at: request.ready_at,
        picked_up_at: request.picked_up_at,
        rejected_at: request.rejected_at,
        cancelled_at: request.cancelled_at,
        equipment_transaction_id: item.equipment_transaction_id || null
      })
    })
    .filter(Boolean) as EquipmentRequestHistoryItem[]
}

export const fetchEquipmentMembers = async () => {
  const { data, error } = await supabase
    .from('team_members_safe')
    .select('id, name, role, avatar_url')
    .in('role', ['校隊', '球員'])
    .order('name', { ascending: true })

  if (error) throw error
  return (data || []) as EquipmentMemberSummary[]
}

export const createEquipment = async (payload: EquipmentFormPayload, imageFiles: File[] = []) => {
  const imageValues = await buildEquipmentImageValues(payload, imageFiles)
  const { data, error } = await supabase
    .from('equipment')
    .insert({ ...payload, ...imageValues })
    .select(EQUIPMENT_SELECT)
    .single()

  if (error) throw error
  return normalizeEquipment(data)
}

export const updateEquipment = async (
  equipmentId: string,
  payload: EquipmentFormPayload,
  imageFiles: File[] = []
) => {
  const imageValues = await buildEquipmentImageValues(payload, imageFiles)
  const { data, error } = await supabase
    .from('equipment')
    .update({ ...payload, ...imageValues, updated_at: new Date().toISOString() })
    .eq('id', equipmentId)
    .select(EQUIPMENT_SELECT)
    .single()

  if (error) throw error
  return normalizeEquipment(data)
}

export const deleteEquipment = async (equipmentId: string) => {
  const { error } = await supabase.from('equipment').delete().eq('id', equipmentId)
  if (error) throw error
}

export const createEquipmentTransaction = async (payload: EquipmentTransactionPayload) => {
  if (payload.transaction_type === 'purchase' && !payload.member_id) {
    throw new Error('請選擇付款歸屬成員')
  }

  const { data, error } = await supabase
    .from('equipment_transactions')
    .insert({
      equipment_id: payload.equipment_id,
      transaction_type: payload.transaction_type,
      transaction_date: payload.transaction_date,
      member_id: payload.member_id || null,
      handled_by: payload.handled_by || null,
      size: payload.size || null,
      quantity: payload.quantity,
      notes: payload.notes || null,
      unit_price: payload.unit_price ?? null
    })
    .select(`
      id,
      equipment_id,
      transaction_type,
      transaction_date,
      member_id,
      handled_by,
      size,
      quantity,
      notes,
      unit_price,
      request_item_id,
      carryover_month,
      payment_status,
      payment_submission_id,
      paid_at,
      paid_by,
      created_at,
      updated_at
    `)
    .single()

  if (error) throw error
  return normalizeTransaction(data)
}

export const deleteEquipmentTransaction = async (transactionId: string) => {
  const { error } = await supabase.from('equipment_transactions').delete().eq('id', transactionId)
  if (error) throw error
}

export const createEquipmentInventoryAdjustment = async (
  payload: EquipmentInventoryAdjustmentPayload
) => {
  const { data, error } = await supabase.rpc('create_equipment_inventory_adjustment', {
    p_equipment_id: payload.equipment_id,
    p_adjustment_date: payload.adjustment_date,
    p_member_id: payload.member_id || null,
    p_handled_by: payload.handled_by || null,
    p_size: payload.size || null,
    p_quantity_delta: payload.quantity_delta,
    p_notes: payload.notes || null
  })

  if (error) throw error
  return normalizeInventoryAdjustment(Array.isArray(data) ? data[0] : data)
}

const REQUEST_SELECT = `
  id,
  member_id,
  requester_user_id,
  status,
  notes,
  ready_note,
  ready_image_url,
  ready_image_urls,
  pickup_note,
  pickup_image_url,
  pickup_image_urls,
  rejection_reason,
  cancel_reason,
  requested_at,
  requested_by,
  approved_at,
  approved_by,
  ready_at,
  ready_by,
  picked_up_at,
  picked_up_by,
  rejected_at,
  rejected_by,
  cancelled_at,
  cancelled_by,
  created_at,
  updated_at
`

const REQUEST_ITEM_SELECT = `
  id,
  request_id,
  equipment_id,
  size,
  quantity,
  equipment_name_snapshot,
  unit_price_snapshot,
  equipment_transaction_id,
  created_at,
  updated_at
`

const fetchProfilesMap = async (profileIds: string[]) => {
  const ids = unique(profileIds)
  if (ids.length === 0) return new Map<string, any>()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, nickname, role')
    .in('id', ids)

  if (error) {
    console.warn('Unable to hydrate equipment requester profiles', error)
    return new Map<string, any>()
  }

  return new Map((data || []).map((profile: any) => [String(profile.id), profile]))
}

const fetchMembersMap = async (memberIds: string[]) => {
  const ids = unique(memberIds)
  if (ids.length === 0) return new Map<string, EquipmentMemberSummary>()

  const { data, error } = await supabase
    .from('team_members_safe')
    .select('id, name, role, avatar_url')
    .in('id', ids)

  if (error) throw error
  return new Map((data || []).map((member: EquipmentMemberSummary) => [String(member.id), member]))
}

const fetchEquipmentsMap = async (equipmentIds: string[]) => {
  const ids = unique(equipmentIds)
  if (ids.length === 0) return new Map<string, Equipment>()

  const { data, error } = await supabase
    .from('equipment')
    .select(EQUIPMENT_SELECT)
    .in('id', ids)

  if (error) throw error
  return new Map((data || []).map((equipment: any) => [String(equipment.id), normalizeEquipment(equipment)]))
}

const fetchEquipmentsWithAvailabilityMap = async (equipmentIds: string[]) => {
  const ids = unique(equipmentIds)
  if (ids.length === 0) return new Map<string, Equipment>()

  const { data, error } = await supabase
    .from('equipment')
    .select(EQUIPMENT_SELECT)
    .in('id', ids)

  if (error) throw error

  const [reservedItems, inventoryTransactions] = await Promise.all([
    fetchReservedRequestItems(ids),
    fetchEquipmentInventoryTransactions(ids)
  ])
  const reservedByEquipmentId = groupRowsByEquipmentId(reservedItems)
  const transactionsByEquipmentId = groupRowsByEquipmentId(inventoryTransactions)

  return new Map((data || []).map((equipment: any) => [
    String(equipment.id),
    normalizeEquipment({
      ...equipment,
      equipment_transactions: transactionsByEquipmentId.get(String(equipment.id)) || [],
      reserved_request_items: reservedByEquipmentId.get(String(equipment.id)) || []
    })
  ]))
}

const fetchRequestTransactionsMap = async (transactionIds: string[]) => {
  const ids = unique(transactionIds)
  if (ids.length === 0) return new Map<string, EquipmentTransaction>()

  const { data, error } = await supabase
    .from('equipment_transactions')
    .select(`
      id,
      equipment_id,
      transaction_type,
      transaction_date,
      member_id,
      handled_by,
      size,
      quantity,
      notes,
      unit_price,
      request_item_id,
      carryover_month,
      payment_status,
      payment_submission_id,
      paid_at,
      paid_by,
      created_at,
      updated_at
    `)
    .in('id', ids)

  if (error) throw error
  return new Map((data || []).map((transaction: any) => [String(transaction.id), normalizeTransaction(transaction)]))
}

const fetchRequestItems = async (requestIds: string[]) => {
  const ids = unique(requestIds)
  if (ids.length === 0) return [] as EquipmentRequestItem[]

  const { data, error } = await supabase
    .from('equipment_purchase_request_items')
    .select(REQUEST_ITEM_SELECT)
    .in('request_id', ids)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map((item: any) => ({
    ...item,
    quantity: normalizeNumber(item.quantity, 1),
    unit_price_snapshot: normalizeNumber(item.unit_price_snapshot)
  }))
}

const hydrateEquipmentRequests = async (rows: any[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return [] as EquipmentPurchaseRequest[]

  const items = await fetchRequestItems(rows.map((row) => row.id))
  const memberMap = await fetchMembersMap(rows.map((row) => row.member_id))
  const profileMap = await fetchProfilesMap(rows.flatMap((row) => [
    row.requester_user_id,
    row.requested_by,
    row.approved_by,
    row.ready_by,
    row.picked_up_by,
    row.rejected_by,
    row.cancelled_by
  ]))
  const equipmentMap = await fetchEquipmentsMap(items.map((item) => item.equipment_id))
  const transactionMap = await fetchRequestTransactionsMap(items.map((item) => item.equipment_transaction_id || ''))
  const itemsByRequestId = new Map<string, EquipmentRequestItem[]>()

  for (const item of items) {
    const requestId = String(item.request_id)
    if (!itemsByRequestId.has(requestId)) itemsByRequestId.set(requestId, [])
    itemsByRequestId.get(requestId)?.push({
      ...item,
      equipment: equipmentMap.get(String(item.equipment_id)) || null,
      equipment_transaction: item.equipment_transaction_id
        ? transactionMap.get(String(item.equipment_transaction_id)) || null
        : null
    })
  }

  return rows.map((row: any) => ({
    ...row,
    ready_image_urls: normalizeUrlList(row?.ready_image_urls, [row?.ready_image_url]),
    pickup_image_urls: normalizeUrlList(row?.pickup_image_urls, [row?.pickup_image_url]),
    member: memberMap.get(String(row.member_id)) || null,
    requester_profile: profileMap.get(String(row.requester_user_id)) || null,
    items: itemsByRequestId.get(String(row.id)) || []
  }))
}

export const fetchMyEquipmentRequests = async (userId: string, linkedMemberIds: string[] = []) => {
  let query = supabase
    .from('equipment_purchase_requests')
    .select(REQUEST_SELECT)
    .order('updated_at', { ascending: false })

  const safeLinkedIds = unique(linkedMemberIds)
  if (safeLinkedIds.length > 0) {
    query = query.or(`requester_user_id.eq.${userId},member_id.in.(${safeLinkedIds.join(',')})`)
  } else {
    query = query.eq('requester_user_id', userId)
  }

  const { data, error } = await query
  if (error) throw error
  return hydrateEquipmentRequests(data || [])
}

export const fetchReviewEquipmentRequests = async () => {
  const { data, error } = await supabase
    .from('equipment_purchase_requests')
    .select(REQUEST_SELECT)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return hydrateEquipmentRequests(data || [])
}

export const listMyEquipmentManualPurchaseRecords = async (memberId?: string | null) => {
  const { data, error } = await supabase.rpc('list_my_equipment_manual_purchase_records', {
    p_member_id: memberId || null
  })

  if (error) throw error
  return unwrapRows<any>(data).map(normalizeManualPurchaseRecord)
}

export const fetchEquipmentRequestById = async (requestId: string) => {
  const { data, error } = await supabase
    .from('equipment_purchase_requests')
    .select(REQUEST_SELECT)
    .eq('id', requestId)
    .single()

  if (error) throw error
  const [request] = await hydrateEquipmentRequests(data ? [data] : [])
  return request || null
}

export const createEquipmentPurchaseRequest = async (
  payload: CreateEquipmentPurchaseRequestPayload,
  requesterUserId: string
) => {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('請先加入至少一項裝備')
  }

  const equipmentIds = unique(payload.items.map((item) => item.equipment_id))
  const equipmentMap = await fetchEquipmentsWithAvailabilityMap(equipmentIds)
  const availability = validateEquipmentPurchaseItemsAvailability(payload.items, equipmentMap)

  if (!availability.isValid) {
    throw new Error(availability.failures[0]?.reason || '部分裝備庫存不足，請調整請購數量')
  }

  const { data: request, error: requestError } = await supabase
    .from('equipment_purchase_requests')
    .insert({
      member_id: payload.member_id,
      requester_user_id: requesterUserId,
      requested_by: requesterUserId,
      notes: payload.notes || null,
      status: 'pending'
    })
    .select(REQUEST_SELECT)
    .single()

  if (requestError) throw requestError

  const itemRows = payload.items.map((item) => {
    const equipment = equipmentMap.get(String(item.equipment_id))
    return {
      request_id: request.id,
      equipment_id: item.equipment_id,
      size: item.size || null,
      quantity: Math.max(Math.floor(Number(item.quantity || 0)), 1),
      equipment_name_snapshot: equipment?.name || '未知裝備',
      unit_price_snapshot: Number(equipment?.purchase_price || 0)
    }
  })

  const { error: itemError } = await supabase
    .from('equipment_purchase_request_items')
    .insert(itemRows)

  if (itemError) throw itemError

  return fetchEquipmentRequestById(request.id)
}

export const approveEquipmentRequest = async (requestId: string, userId: string) => {
  const { error } = await supabase.rpc('approve_equipment_purchase_request', {
    p_request_id: requestId,
    p_user_id: userId
  })

  if (error) throw error
  return fetchEquipmentRequestById(requestId)
}

export const markEquipmentRequestReady = async (
  requestId: string,
  userId: string,
  note?: string | null,
  imageFiles: File[] = []
) => {
  const imageUrls = await uploadEquipmentImages(
    imageFiles,
    'equipment_request_actions/ready'
  )
  const { error } = await supabase
    .from('equipment_purchase_requests')
    .update({
      status: 'ready_for_pickup',
      ready_at: new Date().toISOString(),
      ready_by: userId,
      ready_note: note || null,
      ready_image_url: imageUrls[0] || null,
      ready_image_urls: imageUrls,
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)

  if (error) throw error
  return fetchEquipmentRequestById(requestId)
}

export const markEquipmentRequestPickedUp = async (
  requestId: string,
  userId: string,
  note?: string | null,
  imageFiles: File[] = []
) => {
  const request = await fetchEquipmentRequestById(requestId)
  if (!request) throw new Error('找不到加購申請')

  const now = new Date().toISOString()
  const imageUrls = await uploadEquipmentImages(
    imageFiles,
    'equipment_request_actions/pickup'
  )

  for (const item of request.items) {
    if (item.equipment_transaction_id) continue

    const { data: transaction, error: transactionError } = await supabase
      .from('equipment_transactions')
      .insert({
        equipment_id: item.equipment_id,
        transaction_type: 'purchase',
        transaction_date: now.slice(0, 10),
        member_id: request.member_id,
        handled_by: request.member?.name || null,
        size: item.size || null,
        quantity: item.quantity,
        notes: `加購申請 ${request.id}`,
        unit_price: item.unit_price_snapshot,
        request_item_id: item.id,
        payment_status: 'unpaid'
      })
      .select('id')
      .single()

    if (transactionError) throw transactionError

    const { error: itemError } = await supabase
      .from('equipment_purchase_request_items')
      .update({
        equipment_transaction_id: transaction.id,
        updated_at: now
      })
      .eq('id', item.id)

    if (itemError) throw itemError
  }

  const { error } = await supabase
    .from('equipment_purchase_requests')
    .update({
      status: 'picked_up',
      picked_up_at: now,
      picked_up_by: userId,
      pickup_note: note || null,
      pickup_image_url: imageUrls[0] || null,
      pickup_image_urls: imageUrls,
      updated_at: now
    })
    .eq('id', requestId)

  if (error) throw error
  return fetchEquipmentRequestById(requestId)
}

export const rejectEquipmentRequest = async (requestId: string, userId: string, reason?: string | null) => {
  const { error } = await supabase
    .from('equipment_purchase_requests')
    .update({
      status: 'rejected',
      rejected_at: new Date().toISOString(),
      rejected_by: userId,
      rejection_reason: reason || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)

  if (error) throw error
  return fetchEquipmentRequestById(requestId)
}

export const cancelEquipmentRequest = async (requestId: string, userId: string, reason?: string | null) => {
  const { error } = await supabase
    .from('equipment_purchase_requests')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
      cancel_reason: reason || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)

  if (error) throw error
  return fetchEquipmentRequestById(requestId)
}

export const deleteEquipmentPurchaseRequestWithRollback = async (requestId: string) => {
  const request = await fetchEquipmentRequestById(requestId)
  if (!request) throw new Error('找不到加購申請')

  const transactionIds = unique(request.items.map((item: EquipmentRequestItem) => item.equipment_transaction_id))

  if (transactionIds.length > 0) {
    const { data: transactions, error: transactionFetchError } = await supabase
      .from('equipment_transactions')
      .select('id, payment_status, payment_submission_id')
      .in('id', transactionIds)

    if (transactionFetchError) throw transactionFetchError

    const lockedTransaction = (transactions || []).find((transaction: any) =>
      transaction.payment_submission_id
      || transaction.payment_status === 'pending_review'
      || transaction.payment_status === 'paid'
    )

    if (lockedTransaction) {
      throw new Error('已有付款回報或已確認付款的裝備請購不可直接刪除，請先處理付款回報。')
    }

    const { error: transactionDeleteError } = await supabase
      .from('equipment_transactions')
      .delete()
      .in('id', transactionIds)

    if (transactionDeleteError) throw transactionDeleteError
  }

  const { error } = await supabase
    .from('equipment_purchase_requests')
    .delete()
    .eq('id', requestId)

  if (error) throw error
}

export const listMyEquipmentPaymentItems = async (memberId?: string | null) => {
  const { data, error } = await supabase.rpc('list_my_equipment_payment_items', {
    p_member_id: memberId || null
  })

  if (error) throw error
  return unwrapRows<any>(data).map((item) => ({
    ...item,
    quantity: normalizeNumber(item?.quantity),
    unit_price: normalizeNumber(item?.unit_price),
    total_amount: normalizeNumber(item?.total_amount)
  }))
}

export const listMyEquipmentPendingRequestPaymentItems = async (memberId?: string | null) => {
  const { data, error } = await supabase.rpc('list_my_equipment_pending_request_payment_items', {
    p_member_id: memberId || null
  })

  if (error) throw error
  return unwrapRows<any>(data).map(normalizePendingRequestPaymentItem)
}

export const createEquipmentPaymentSubmission = async (
  payload: CreateEquipmentPaymentSubmissionPayload
) => {
  const { data, error } = await supabase.rpc('create_equipment_payment_submission', {
    p_transaction_ids: payload.transaction_ids,
    p_payment_method: payload.payment_method,
    p_account_last_5: payload.account_last_5 || null,
    p_remittance_date: payload.remittance_date,
    p_note: payload.note || null
  })

  if (error) throw error
  return normalizePaymentSubmission(unwrapRows<any>(data)[0])
}

export const listEquipmentPaymentSubmissions = async () => {
  const { data, error } = await supabase.rpc('list_equipment_payment_submissions')
  if (error) throw error
  return unwrapRows<any>(data).map(normalizePaymentSubmission)
}

export const reviewEquipmentPaymentSubmission = async (
  submissionId: string,
  status: 'approved' | 'rejected'
) => {
  const { data, error } = await supabase.rpc('review_equipment_payment_submission', {
    p_submission_id: submissionId,
    p_status: status
  })

  if (error) throw error
  return normalizePaymentSubmission(unwrapRows<any>(data)[0])
}
