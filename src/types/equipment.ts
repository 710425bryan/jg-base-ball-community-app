export type EquipmentCategory = '服飾類' | '球具類' | '消耗品' | '其他'

export type EquipmentTransactionType = 'borrow' | 'receive' | 'return' | 'purchase'

export type EquipmentRequestStatus =
  | 'pending'
  | 'approved'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'rejected'
  | 'cancelled'

export type EquipmentPaymentStatus = 'unpaid' | 'pending_review' | 'paid' | 'cancelled'

export type EquipmentPaymentSubmissionStatus = 'pending_review' | 'approved' | 'rejected'

export type EquipmentSizeStock = {
  size: string
  quantity: number
}

export type EquipmentReservedRequestItem = {
  id: string
  request_id: string
  equipment_id: string
  size: string | null
  quantity: number
  unit_price_snapshot: number | null
}

export type EquipmentMemberSummary = {
  id: string
  name: string
  role: string | null
  avatar_url?: string | null
}

export type EquipmentTransaction = {
  id: string
  equipment_id: string
  transaction_type: EquipmentTransactionType
  transaction_date: string
  member_id: string | null
  handled_by: string | null
  size: string | null
  quantity: number
  notes: string | null
  unit_price: number | null
  request_item_id: string | null
  carryover_month: string | null
  payment_status: EquipmentPaymentStatus | string | null
  payment_submission_id: string | null
  paid_at: string | null
  paid_by: string | null
  created_at: string
  updated_at: string
  team_members?: {
    name?: string | null
    role?: string | null
  } | null
}

export type EquipmentInventoryAdjustment = {
  id: string
  equipment_id: string
  adjustment_type: 'stock_in' | string
  adjustment_date: string
  member_id: string | null
  handled_by: string | null
  size: string | null
  quantity_delta: number
  total_quantity_after: number
  sizes_stock_after: EquipmentSizeStock[]
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  team_members?: {
    name?: string | null
    role?: string | null
  } | null
}

export type Equipment = {
  id: string
  name: string
  category: EquipmentCategory | string
  specs: string | null
  notes: string | null
  image_url: string | null
  purchase_price: number
  quick_purchase_enabled: boolean
  total_quantity: number
  purchased_by: string | null
  sizes_stock: EquipmentSizeStock[]
  created_at: string
  updated_at: string
  equipment_transactions?: EquipmentTransaction[]
  inventory_adjustments?: EquipmentInventoryAdjustment[]
  reserved_request_items?: EquipmentReservedRequestItem[]
}

export type EquipmentFormPayload = {
  name: string
  category: EquipmentCategory | string
  specs?: string | null
  notes?: string | null
  image_url?: string | null
  purchase_price: number
  quick_purchase_enabled: boolean
  total_quantity: number
  purchased_by?: string | null
  sizes_stock: EquipmentSizeStock[]
}

export type EquipmentTransactionPayload = {
  equipment_id: string
  transaction_type: EquipmentTransactionType
  transaction_date: string
  member_id?: string | null
  handled_by?: string | null
  size?: string | null
  quantity: number
  notes?: string | null
  unit_price?: number | null
}

export type EquipmentInventoryAdjustmentPayload = {
  equipment_id: string
  adjustment_date: string
  member_id?: string | null
  handled_by?: string | null
  size?: string | null
  quantity_delta: number
  notes?: string | null
}

export type EquipmentRequestItem = {
  id: string
  request_id: string
  equipment_id: string
  size: string | null
  quantity: number
  equipment_name_snapshot: string
  unit_price_snapshot: number
  equipment_transaction_id: string | null
  created_at: string
  updated_at: string
  equipment?: Equipment | null
  equipment_transaction?: EquipmentTransaction | null
}

export type EquipmentPurchaseRequest = {
  id: string
  member_id: string
  requester_user_id: string
  status: EquipmentRequestStatus | string
  notes: string | null
  ready_note: string | null
  ready_image_url: string | null
  pickup_note: string | null
  pickup_image_url: string | null
  rejection_reason: string | null
  cancel_reason: string | null
  requested_at: string
  requested_by: string | null
  approved_at: string | null
  approved_by: string | null
  ready_at: string | null
  ready_by: string | null
  picked_up_at: string | null
  picked_up_by: string | null
  rejected_at: string | null
  rejected_by: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  created_at: string
  updated_at: string
  member?: EquipmentMemberSummary | null
  requester_profile?: {
    id: string
    name?: string | null
    nickname?: string | null
    role?: string | null
  } | null
  items: EquipmentRequestItem[]
}

export type CreateEquipmentPurchaseRequestPayload = {
  member_id: string
  notes?: string | null
  items: Array<{
    equipment_id: string
    size?: string | null
    quantity: number
  }>
}

export type EquipmentPaymentItem = {
  transaction_id: string
  request_id: string | null
  member_id: string
  member_name: string
  equipment_id: string
  equipment_name: string
  size: string | null
  quantity: number
  unit_price: number
  total_amount: number
  payment_status: EquipmentPaymentStatus | string
  payment_submission_id: string | null
  transaction_date: string
  picked_up_at: string | null
}

export type EquipmentManualPurchaseRecord = {
  transaction_id: string
  member_id: string
  member_name: string
  equipment_id: string
  equipment_name: string
  size: string | null
  quantity: number
  unit_price: number
  total_amount: number
  payment_status: EquipmentPaymentStatus | string
  payment_submission_id: string | null
  transaction_date: string
  notes: string | null
  handled_by: string | null
  created_at: string
  updated_at: string
}

export type EquipmentPendingRequestPaymentItem = {
  request_item_id: string
  request_id: string
  member_id: string
  member_name: string
  equipment_id: string
  equipment_name: string
  size: string | null
  quantity: number
  unit_price: number
  total_amount: number
  request_status: EquipmentRequestStatus | string
  requested_at: string
  approved_at: string | null
  ready_at: string | null
}

export type EquipmentRequestHistoryItem = {
  request_item_id: string
  request_id: string
  equipment_id: string
  member_id: string
  member_name: string
  size: string | null
  quantity: number
  unit_price: number
  total_amount: number
  request_status: EquipmentRequestStatus | string
  requested_at: string
  approved_at: string | null
  ready_at: string | null
  picked_up_at: string | null
  rejected_at: string | null
  cancelled_at: string | null
  equipment_transaction_id: string | null
}

export type EquipmentPaymentSubmission = {
  id: string
  profile_id: string
  member_id: string
  member_name: string
  amount: number
  payment_method: string
  account_last_5: string | null
  remittance_date: string
  note: string | null
  status: EquipmentPaymentSubmissionStatus
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  updated_at: string
  items: EquipmentPaymentItem[]
}

export type CreateEquipmentPaymentSubmissionPayload = {
  transaction_ids: string[]
  payment_method: string
  account_last_5?: string | null
  remittance_date: string
  note?: string | null
}
