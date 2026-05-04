import { supabase } from '@/services/supabase'
import {
  createEmptyMyHomeSnapshot,
  type MyHomeEquipmentRequest,
  type MyHomeLeaveStatus,
  type MyHomeMember,
  type MyHomeNextEvent,
  type MyHomePaymentDueItem,
  type MyHomeSnapshot,
  type MyHomeTrainingLocation
} from '@/types/myHome'
import {
  isSupabaseRpcMissingError,
  isSupabaseRpcUnavailable,
  markSupabaseRpcUnavailable
} from '@/utils/supabaseRpc'

const RPC_NAME = 'get_my_home_snapshot'

const ensureArray = <T>(value: unknown): T[] => Array.isArray(value) ? (value as T[]) : []

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getWeekStartDate = (today?: string | null) => {
  if (!today) return null
  const [year, month, day] = today.split('-').map(Number)
  if (!year || !month || !day) return null

  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - weekday + 1)
  return date.toISOString().slice(0, 10)
}

const hasOwn = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

const hasTrainingPointFields = (member: Partial<MyHomeMember> | null | undefined) =>
  Boolean(member
    && hasOwn(member, 'point_balance')
    && (hasOwn(member, 'reserved_training_points') || hasOwn(member, 'reserved_points'))
    && (hasOwn(member, 'available_training_points') || hasOwn(member, 'available_points')))

const normalizeMember = (member: Partial<MyHomeMember> & Record<string, unknown>): MyHomeMember => ({
  ...member,
  id: String(member.id || ''),
  name: String(member.name || ''),
  role: member.role ? String(member.role) : null,
  team_group: member.team_group ? String(member.team_group) : null,
  status: member.status ? String(member.status) : null,
  jersey_number: member.jersey_number === null || member.jersey_number === undefined
    ? null
    : String(member.jersey_number),
  avatar_url: member.avatar_url ? String(member.avatar_url) : null,
  point_balance: normalizeNumber(member.point_balance),
  reserved_training_points: normalizeNumber(member.reserved_training_points ?? member.reserved_points),
  available_training_points: normalizeNumber(member.available_training_points ?? member.available_points)
})

const normalizeTrainingLocation = (row: Partial<MyHomeTrainingLocation>): MyHomeTrainingLocation => ({
  session_id: String(row?.session_id || ''),
  member_id: String(row?.member_id || ''),
  member_name: String(row?.member_name || ''),
  title: String(row?.title || ''),
  training_date: String(row?.training_date || ''),
  start_time: row?.start_time ? String(row.start_time) : null,
  end_time: row?.end_time ? String(row.end_time) : null,
  venue_name: String(row?.venue_name || ''),
  venue_address: row?.venue_address ? String(row.venue_address) : null,
  venue_maps_url: row?.venue_maps_url ? String(row.venue_maps_url) : null,
  is_on_leave: Boolean(row?.is_on_leave)
})

const enrichMembersWithTrainingPoints = async (
  snapshot: MyHomeSnapshot,
  rawMembers: Array<Partial<MyHomeMember>>
): Promise<MyHomeSnapshot> => {
  if (snapshot.members.length === 0 || rawMembers.every(hasTrainingPointFields)) {
    return snapshot
  }

  try {
    const { data, error } = await supabase.rpc('list_my_training_members')
    if (error) throw error

    const pointByMemberId = new Map(
      ensureArray<any>(data).map((member) => [
        String(member?.member_id || ''),
        {
          point_balance: normalizeNumber(member?.point_balance),
          reserved_training_points: normalizeNumber(member?.reserved_points),
          available_training_points: normalizeNumber(member?.available_points)
        }
      ])
    )

    return {
      ...snapshot,
      members: snapshot.members.map((member) => ({
        ...member,
        ...(pointByMemberId.get(member.id) || {})
      }))
    }
  } catch (error) {
    console.warn('list_my_training_members RPC 無法補齊首頁特訓點數，暫以首頁摘要資料顯示。', error)
    return snapshot
  }
}

const enrichSnapshotWithTrainingLocations = async (
  snapshot: MyHomeSnapshot,
  rawPayload: Partial<MyHomeSnapshot> | null | undefined,
  today?: string | null
): Promise<MyHomeSnapshot> => {
  if (rawPayload && 'training_locations' in rawPayload) {
    return snapshot
  }

  try {
    const { data, error } = await supabase.rpc('list_my_week_training_locations', {
      p_week_start: getWeekStartDate(today)
    })
    if (error) throw error

    return {
      ...snapshot,
      training_locations: ensureArray<Partial<MyHomeTrainingLocation>>(data).map(normalizeTrainingLocation)
    }
  } catch (error) {
    console.warn('list_my_week_training_locations RPC 無法補齊首頁訓練場地，暫以首頁摘要資料顯示。', error)
    return snapshot
  }
}

const normalizeSnapshot = (payload: Partial<MyHomeSnapshot> | null | undefined): MyHomeSnapshot => {
  const fallback = createEmptyMyHomeSnapshot()

  return {
    members: ensureArray<MyHomeMember>(payload?.members).map(normalizeMember),
    next_event: (payload?.next_event ?? fallback.next_event) as MyHomeNextEvent | null,
    today_leaves: ensureArray<MyHomeLeaveStatus>(payload?.today_leaves),
    training_locations: ensureArray<Partial<MyHomeTrainingLocation>>(payload?.training_locations).map(normalizeTrainingLocation),
    payment_summary: {
      unpaid_count: normalizeNumber(payload?.payment_summary?.unpaid_count),
      pending_review_count: normalizeNumber(payload?.payment_summary?.pending_review_count),
      total_unpaid_amount: normalizeNumber(payload?.payment_summary?.total_unpaid_amount),
      next_due: (payload?.payment_summary?.next_due ?? null) as MyHomePaymentDueItem | null
    },
    equipment_summary: {
      active_request_count: normalizeNumber(payload?.equipment_summary?.active_request_count),
      ready_for_pickup_count: normalizeNumber(payload?.equipment_summary?.ready_for_pickup_count),
      picked_up_unpaid_count: normalizeNumber(payload?.equipment_summary?.picked_up_unpaid_count),
      pending_payment_count: normalizeNumber(payload?.equipment_summary?.pending_payment_count),
      unpaid_amount: normalizeNumber(payload?.equipment_summary?.unpaid_amount),
      latest_request: (payload?.equipment_summary?.latest_request ?? null) as MyHomeEquipmentRequest | null
    },
    recent_notifications: ensureArray(payload?.recent_notifications),
    generated_at: payload?.generated_at ?? null
  }
}

export const getMyHomeSnapshot = async (today?: string | null) => {
  if (isSupabaseRpcUnavailable(RPC_NAME)) {
    return createEmptyMyHomeSnapshot()
  }

  const { data, error } = await supabase.rpc(RPC_NAME, {
    p_today: today || null
  })

  if (error) {
    if (isSupabaseRpcMissingError(error, RPC_NAME)) {
      markSupabaseRpcUnavailable(RPC_NAME)
      console.warn(`${RPC_NAME} RPC 尚未部署，個人化首頁暫時顯示空狀態。`)
      return createEmptyMyHomeSnapshot()
    }

    throw error
  }

  const payload = (data ?? null) as Partial<MyHomeSnapshot> | null
  const rawMembers = ensureArray<Partial<MyHomeMember>>(payload?.members)
  const snapshot = await enrichSnapshotWithTrainingLocations(
    normalizeSnapshot(payload),
    payload,
    today
  )

  return enrichMembersWithTrainingPoints(snapshot, rawMembers)
}
