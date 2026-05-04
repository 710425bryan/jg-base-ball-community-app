import type { NotificationFeedRow } from '@/types/dashboard'

export type MyHomeMember = {
  id: string
  name: string
  role: string | null
  team_group: string | null
  status: string | null
  jersey_number: string | null
  avatar_url: string | null
  point_balance?: number
  reserved_training_points?: number
  available_training_points?: number
}

export type MyHomeEventType = 'match' | 'attendance'

export type MyHomeNextEvent = {
  id: string
  type: MyHomeEventType
  title: string
  date: string
  time: string | null
  location: string | null
  opponent: string | null
  category_group: string | null
  match_level: string | null
  coaches: string | null
  players: string | null
  route: string
}

export type MyHomeLeaveStatus = {
  id: string
  member_id: string
  member_name: string
  leave_type: string
  start_date: string
  end_date: string
  reason: string | null
}

export type MyHomeTrainingLocation = {
  session_id: string
  member_id: string
  member_name: string
  title: string
  training_date: string
  start_time: string | null
  end_time: string | null
  venue_name: string
  venue_address: string | null
  venue_maps_url: string | null
  is_on_leave: boolean
}

export type MyHomePaymentDueItem = {
  member_id: string
  member_name: string
  billing_mode: 'monthly' | 'quarterly' | string
  period_label: string
  amount: number
  status: string
}

export type MyHomePaymentSummary = {
  unpaid_count: number
  pending_review_count: number
  total_unpaid_amount: number
  next_due: MyHomePaymentDueItem | null
}

export type MyHomeEquipmentRequest = {
  id: string
  member_id: string
  member_name: string
  status: string
  item_count: number
  total_amount: number
  updated_at: string
}

export type MyHomeEquipmentSummary = {
  active_request_count: number
  ready_for_pickup_count: number
  picked_up_unpaid_count: number
  pending_payment_count: number
  unpaid_amount: number
  latest_request: MyHomeEquipmentRequest | null
}

export type MyHomeSnapshot = {
  members: MyHomeMember[]
  next_event: MyHomeNextEvent | null
  today_leaves: MyHomeLeaveStatus[]
  training_locations: MyHomeTrainingLocation[]
  payment_summary: MyHomePaymentSummary
  equipment_summary: MyHomeEquipmentSummary
  recent_notifications: NotificationFeedRow[]
  generated_at: string | null
}

export type MyHomeTodoSeverity = 'info' | 'success' | 'warning' | 'danger'

export type MyHomeTodoItem = {
  key: string
  title: string
  body: string
  severity: MyHomeTodoSeverity
  actionLabel: string
  route?: string
}

export const createEmptyMyHomeSnapshot = (): MyHomeSnapshot => ({
  members: [],
  next_event: null,
  today_leaves: [],
  training_locations: [],
  payment_summary: {
    unpaid_count: 0,
    pending_review_count: 0,
    total_unpaid_amount: 0,
    next_due: null
  },
  equipment_summary: {
    active_request_count: 0,
    ready_for_pickup_count: 0,
    picked_up_unpaid_count: 0,
    pending_payment_count: 0,
    unpaid_amount: 0,
    latest_request: null
  },
  recent_notifications: [],
  generated_at: null
})
