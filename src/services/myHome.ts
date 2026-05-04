import { supabase } from '@/services/supabase'
import {
  createEmptyMyHomeSnapshot,
  type MyHomeEquipmentRequest,
  type MyHomeLeaveStatus,
  type MyHomeMember,
  type MyHomeNextEvent,
  type MyHomePaymentDueItem,
  type MyHomeSnapshot
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

const hasTrainingPointFields = (member: Partial<MyHomeMember> | null | undefined) =>
  Boolean(member && (
    'point_balance' in member
    || 'reserved_training_points' in member
    || 'available_training_points' in member
  ))

const normalizeMember = (member: MyHomeMember): MyHomeMember => ({
  ...member,
  point_balance: normalizeNumber(member.point_balance),
  reserved_training_points: normalizeNumber(member.reserved_training_points),
  available_training_points: normalizeNumber(member.available_training_points)
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

const normalizeSnapshot = (payload: Partial<MyHomeSnapshot> | null | undefined): MyHomeSnapshot => {
  const fallback = createEmptyMyHomeSnapshot()

  return {
    members: ensureArray<MyHomeMember>(payload?.members).map(normalizeMember),
    next_event: (payload?.next_event ?? fallback.next_event) as MyHomeNextEvent | null,
    today_leaves: ensureArray<MyHomeLeaveStatus>(payload?.today_leaves),
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
  const snapshot = normalizeSnapshot(payload)

  return enrichMembersWithTrainingPoints(snapshot, rawMembers)
}
