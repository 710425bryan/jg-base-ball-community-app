import { supabase } from '@/services/supabase'
import { listMyMatchFeeItems } from '@/services/matchFees'
import { trainingDatesApi } from '@/services/trainingDatesApi'
import { trainingProgramsApi } from '@/services/trainingProgramsApi'
import {
  createEmptyMyHomeSnapshot,
  type MyHomeEquipmentRequest,
  type MyHomeLeaveStatus,
  type MyHomeMember,
  type MyHomePaymentDueItem,
  type MyHomeSnapshot,
  type MyHomeTrainingMonthDate,
  type MyHomeTrainingLocation
} from '@/types/myHome'
import {
  isSupabaseRpcMissingError,
  isSupabaseRpcUnavailable,
  markSupabaseRpcUnavailable
} from '@/utils/supabaseRpc'
import { normalizeMyHomeNextEvent } from '@/utils/myHomeSnapshot'
import { isActiveRosterMember } from '@/utils/memberLifecycle'
import { leaveTimeSegmentOverlapsEventTime } from '@/utils/attendanceLeave'
import { normalizeLeaveTimeSegment } from '@/utils/leaveRequests'
import { buildTrainingLocationLeaveEventTimeText } from '@/utils/trainingLocationLeave'
import {
  buildTrainingMonthDateItems,
  getDefaultTrainingMonthDates,
  normalizeTrainingMonth
} from '@/utils/trainingMonthDates'
import {
  DEFAULT_TRAINING_PROGRAM_KEY,
  getScopedTrainingProgramForMember,
  getTrainingProgramFallbackSettings,
  getTrainingProgramKeyForMember,
  getTrainingProgramSettingByKey,
  normalizeTrainingProgramKey,
  normalizeTrainingProgramLabel
} from '@/utils/trainingPrograms'
import type { TrainingProgramSetting } from '@/types/trainingProgram'

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

type MyHomeLeaveRequestRow = {
  id?: string | null
  member_id?: string | null
  start_date?: string | null
  end_date?: string | null
  leave_time_segment?: string | null
}

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
  training_program: member.training_program ? String(member.training_program) : null,
  training_program_label: member.training_program_label ? normalizeTrainingProgramLabel(member.training_program_label) : null,
  status: member.status ? String(member.status) : null,
  is_inactive_or_graduated: Boolean(member.is_inactive_or_graduated),
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
  program_key: row?.program_key ? String(row.program_key) : null,
  program_label: row?.program_label ? normalizeTrainingProgramLabel(row.program_label) : null,
  title: String(row?.title || ''),
  training_date: String(row?.training_date || ''),
  start_time: row?.start_time ? String(row.start_time) : null,
  end_time: row?.end_time ? String(row.end_time) : null,
  venue_name: String(row?.venue_name || ''),
  venue_address: row?.venue_address ? String(row.venue_address) : null,
  venue_maps_url: row?.venue_maps_url ? String(row.venue_maps_url) : null,
  is_on_leave: Boolean(row?.is_on_leave)
})

const normalizeTrainingMonthDate = (row: Partial<MyHomeTrainingMonthDate> | string): MyHomeTrainingMonthDate => {
  if (typeof row === 'string') {
    return buildTrainingMonthDateItems([row])[0] || {
      date: row,
      weekday: '',
      label: row,
      is_today: false,
      is_past: false
    }
  }

  return {
    date: String(row?.date || ''),
    weekday: String(row?.weekday || ''),
    label: String(row?.label || row?.date || ''),
    is_today: Boolean(row?.is_today),
    is_past: Boolean(row?.is_past)
  }
}

const isDateWithinLeaveRange = (date: string, leave: MyHomeLeaveRequestRow) => {
  const startDate = String(leave.start_date || '')
  const endDate = String(leave.end_date || startDate)
  return Boolean(date && startDate && startDate <= date && endDate >= date)
}

const enrichSnapshotWithLeaveSegments = async (snapshot: MyHomeSnapshot): Promise<MyHomeSnapshot> => {
  const memberIds = Array.from(new Set(
    [
      ...snapshot.today_leaves.map((leave) => leave.member_id),
      ...snapshot.training_locations.map((location) => location.member_id)
    ].filter(Boolean)
  ))

  if (memberIds.length === 0) return snapshot

  const rowsByMemberId = new Map<string, MyHomeLeaveRequestRow[]>()
  const successfulMemberIds = new Set<string>()

  await Promise.all(memberIds.map(async (memberId) => {
    try {
      const { data, error } = await supabase.rpc('list_my_leave_requests', {
        p_member_id: memberId
      })
      if (error) throw error

      rowsByMemberId.set(
        memberId,
        ensureArray<MyHomeLeaveRequestRow>(data).map((row) => ({
          ...row,
          member_id: row.member_id ? String(row.member_id) : memberId,
          leave_time_segment: normalizeLeaveTimeSegment(row.leave_time_segment)
        }))
      )
      successfulMemberIds.add(memberId)
    } catch (error) {
      console.warn(`無法補齊 ${memberId} 的請假時段，暫以首頁 snapshot 顯示。`, error)
    }
  }))

  if (successfulMemberIds.size === 0) return snapshot

  return {
    ...snapshot,
    today_leaves: snapshot.today_leaves.map((leave) => {
      if (!successfulMemberIds.has(leave.member_id)) return leave
      const matchedLeave = rowsByMemberId.get(leave.member_id)?.find((row) => row.id === leave.id)
      return {
        ...leave,
        leave_time_segment: normalizeLeaveTimeSegment(matchedLeave?.leave_time_segment || leave.leave_time_segment)
      }
    }),
    training_locations: snapshot.training_locations.map((location) => {
      if (!successfulMemberIds.has(location.member_id)) return location
      const isOnLeave = rowsByMemberId.get(location.member_id)?.some((leave) =>
        isDateWithinLeaveRange(location.training_date, leave)
        && leaveTimeSegmentOverlapsEventTime(
          leave.leave_time_segment,
          buildTrainingLocationLeaveEventTimeText(location)
        )
      ) || false
      return {
        ...location,
        is_on_leave: isOnLeave
      }
    })
  }
}

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

const enrichSnapshotWithTrainingPrograms = (
  snapshot: MyHomeSnapshot,
  settings: TrainingProgramSetting[]
): MyHomeSnapshot => ({
  ...snapshot,
  members: snapshot.members.map((member) => {
    const program = member.training_program
      ? getTrainingProgramSettingByKey(settings, member.training_program)
      : getScopedTrainingProgramForMember(member, settings)
    return {
      ...member,
      training_program: program?.program_key || null,
      training_program_label: program?.label || null
    }
  }),
  training_locations: snapshot.training_locations.map((location) => {
    if (location.program_key) return location
    const member = snapshot.members.find((item) => item.id === location.member_id)
    const program = member
      ? getScopedTrainingProgramForMember(member, settings)
      : getTrainingProgramSettingByKey(settings, DEFAULT_TRAINING_PROGRAM_KEY)
    return {
      ...location,
      program_key: program?.program_key || DEFAULT_TRAINING_PROGRAM_KEY,
      program_label: program?.label || getTrainingProgramSettingByKey(settings, DEFAULT_TRAINING_PROGRAM_KEY).label
    }
  })
})

const getSnapshotTrainingProgramKeys = (
  snapshot: MyHomeSnapshot,
  settings: TrainingProgramSetting[]
) => {
  const programKeys = Array.from(new Set(
    snapshot.members
      .map((member) => getTrainingProgramKeyForMember(member, settings))
      .filter((programKey): programKey is string => Boolean(programKey))
  ))
  if (programKeys.length === 0) programKeys.push(DEFAULT_TRAINING_PROGRAM_KEY)
  return programKeys
}

const fetchTrainingMonthDateEntry = async (
  programKey: string,
  settings: TrainingProgramSetting[],
  month: string,
  today?: string | null
) => {
  const setting = getTrainingProgramSettingByKey(settings, programKey)
  try {
    const result = await trainingDatesApi.getMonthDates(month, {
      programKey: setting.program_key,
      programLabel: setting.label,
      defaultWeekdays: setting.default_weekdays
    })
    return [setting.program_key, buildTrainingMonthDateItems(result.training_dates, today)] as const
  } catch (error) {
    console.warn(`get_training_month_dates RPC 無法補齊 ${setting.label} 首頁訓練日期，暫以項目預設星期顯示。`, error)
    return [
      setting.program_key,
      buildTrainingMonthDateItems(getDefaultTrainingMonthDates(month, setting.default_weekdays), today)
    ] as const
  }
}

export const getMyHomeTrainingMonthDates = async (input: {
  programKey?: string | null
  month?: string | null
  today?: string | null
}) => {
  const month = normalizeTrainingMonth(input.month || input.today)
  const programSettings = await trainingProgramsApi.listSettings().catch((error) => {
    console.warn('訓練項目設定無法載入，首頁訓練日期暫以預設項目顯示。', error)
    return getTrainingProgramFallbackSettings()
  })
  const [, dates] = await fetchTrainingMonthDateEntry(
    input.programKey || DEFAULT_TRAINING_PROGRAM_KEY,
    programSettings,
    month,
    input.today
  )

  return dates
}

const enrichSnapshotWithTrainingMonthDates = async (
  snapshot: MyHomeSnapshot,
  rawPayload: Partial<MyHomeSnapshot> | null | undefined,
  settings: TrainingProgramSetting[],
  today?: string | null
): Promise<MyHomeSnapshot> => {
  const month = normalizeTrainingMonth(today)
  const programKeys = getSnapshotTrainingProgramKeys(snapshot, settings)
  const datesByProgram: Record<string, MyHomeTrainingMonthDate[]> = {}

  const rawDatesByProgram = rawPayload && 'training_month_dates_by_program' in rawPayload
    ? (rawPayload as any).training_month_dates_by_program
    : null

  if (rawDatesByProgram && typeof rawDatesByProgram === 'object' && !Array.isArray(rawDatesByProgram)) {
    Object.entries(rawDatesByProgram as Record<string, unknown>).forEach(([programKey, dates]) => {
      datesByProgram[normalizeTrainingProgramKey(programKey)] = buildTrainingMonthDateItems(
        ensureArray<Partial<MyHomeTrainingMonthDate> | string>(dates).map((item) => (
          typeof item === 'string' ? item : String(item?.date || '')
        )),
        today
      )
    })
  }

  if (rawPayload && 'training_month_dates' in rawPayload) {
    datesByProgram[DEFAULT_TRAINING_PROGRAM_KEY] = buildTrainingMonthDateItems(
      snapshot.training_month_dates.map((item) => item.date),
      today
    )
  }

  const missingProgramKeys = programKeys.filter((programKey) => !datesByProgram[programKey])
  const fetchedEntries = await Promise.all(missingProgramKeys.map((programKey) =>
    fetchTrainingMonthDateEntry(programKey, settings, month, today)
  ))

  fetchedEntries.forEach(([programKey, dates]) => {
    datesByProgram[programKey] = dates
  })

  const defaultKey = snapshot.members[0]?.training_program || DEFAULT_TRAINING_PROGRAM_KEY
  return {
    ...snapshot,
    training_month_dates_by_program: datesByProgram,
    training_month_dates: datesByProgram[defaultKey] || datesByProgram[DEFAULT_TRAINING_PROGRAM_KEY] || []
  }
}

const enrichSnapshotWithMatchFees = async (snapshot: MyHomeSnapshot): Promise<MyHomeSnapshot> => {
  if (snapshot.members.length === 0) {
    return snapshot
  }

  try {
    const itemGroups = await Promise.all(
      snapshot.members.map(async (member) => {
        try {
          return await listMyMatchFeeItems(member.id)
        } catch (error) {
          console.warn(`讀取 ${member.name} 的比賽費用摘要失敗`, error)
          return []
        }
      })
    )

    const items = itemGroups.flat()
    const unpaidItems = items.filter((item) => item.payment_status === 'unpaid')
    const pendingItems = items.filter((item) => item.payment_status === 'pending_review')

    return {
      ...snapshot,
      match_fee_summary: {
        unpaid_count: unpaidItems.length,
        pending_review_count: pendingItems.length,
        unpaid_amount: unpaidItems.reduce((total, item) => total + normalizeNumber(item.amount), 0)
      }
    }
  } catch (error) {
    console.warn('首頁比賽費用摘要補齊失敗，暫以 RPC 回傳資料顯示。', error)
    return snapshot
  }
}

const filterActiveSnapshotMembers = async (snapshot: MyHomeSnapshot): Promise<MyHomeSnapshot> => {
  const memberIds = snapshot.members
    .map((member) => member.id)
    .filter((id) => id.trim().length > 0)

  if (memberIds.length === 0) return snapshot

  const { data, error } = await supabase
    .from('team_members_safe')
    .select('id, status, is_inactive_or_graduated, training_program')
    .in('id', memberIds)

  if (error) {
    console.warn('無法確認首頁關聯成員是否關閉/畢業，暫以首頁 RPC 回傳資料顯示。', error)
    return snapshot
  }

  const activeMemberIds = new Set(
    (data || [])
      .filter(isActiveRosterMember)
      .map((member) => String(member.id))
  )
  const activeMemberMetaById = new Map(
    (data || [])
      .filter(isActiveRosterMember)
      .map((member: any) => [
        String(member.id),
        {
          training_program: member.training_program ? String(member.training_program) : null
        }
      ])
  )
  const hasMemberRemoved = activeMemberIds.size !== memberIds.length

  const nextMembers = snapshot.members
    .filter((member) => activeMemberIds.has(member.id))
    .map((member) => ({
      ...member,
      training_program: member.training_program || activeMemberMetaById.get(member.id)?.training_program || null
    }))

  if (!hasMemberRemoved) {
    return {
      ...snapshot,
      members: nextMembers
    }
  }

  const nextPaymentDue = snapshot.payment_summary.next_due
  const latestEquipmentRequest = snapshot.equipment_summary.latest_request
  const hasActiveMembers = activeMemberIds.size > 0

  return {
    ...snapshot,
    members: nextMembers,
    today_leaves: snapshot.today_leaves.filter((leave) => activeMemberIds.has(leave.member_id)),
    training_locations: snapshot.training_locations.filter((location) => activeMemberIds.has(location.member_id)),
    payment_summary: {
      ...snapshot.payment_summary,
      unpaid_count: hasActiveMembers ? snapshot.payment_summary.unpaid_count : 0,
      pending_review_count: hasActiveMembers ? snapshot.payment_summary.pending_review_count : 0,
      total_unpaid_amount: hasActiveMembers ? snapshot.payment_summary.total_unpaid_amount : 0,
      next_due: nextPaymentDue && activeMemberIds.has(nextPaymentDue.member_id) ? nextPaymentDue : null
    },
    equipment_summary: {
      ...snapshot.equipment_summary,
      active_request_count: hasActiveMembers ? snapshot.equipment_summary.active_request_count : 0,
      ready_for_pickup_count: hasActiveMembers ? snapshot.equipment_summary.ready_for_pickup_count : 0,
      picked_up_unpaid_count: hasActiveMembers ? snapshot.equipment_summary.picked_up_unpaid_count : 0,
      pending_payment_count: hasActiveMembers ? snapshot.equipment_summary.pending_payment_count : 0,
      unpaid_amount: hasActiveMembers ? snapshot.equipment_summary.unpaid_amount : 0,
      latest_request: latestEquipmentRequest && activeMemberIds.has(latestEquipmentRequest.member_id)
        ? latestEquipmentRequest
        : null
    },
    match_fee_summary: hasActiveMembers
      ? snapshot.match_fee_summary
      : createEmptyMyHomeSnapshot().match_fee_summary
  }
}

const normalizeSnapshot = (payload: Partial<MyHomeSnapshot> | null | undefined): MyHomeSnapshot => {
  return {
    members: ensureArray<MyHomeMember>(payload?.members).map(normalizeMember),
    next_event: normalizeMyHomeNextEvent(payload?.next_event),
    today_leaves: ensureArray<MyHomeLeaveStatus>(payload?.today_leaves),
    training_locations: ensureArray<Partial<MyHomeTrainingLocation>>(payload?.training_locations).map(normalizeTrainingLocation),
    training_month_dates: ensureArray<Partial<MyHomeTrainingMonthDate> | string>(payload?.training_month_dates).map(normalizeTrainingMonthDate),
    training_month_dates_by_program: {},
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
    match_fee_summary: {
      unpaid_count: normalizeNumber(payload?.match_fee_summary?.unpaid_count),
      pending_review_count: normalizeNumber(payload?.match_fee_summary?.pending_review_count),
      unpaid_amount: normalizeNumber(payload?.match_fee_summary?.unpaid_amount)
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
  const programSettings = await trainingProgramsApi.listSettings().catch((error) => {
    console.warn('訓練項目設定無法載入，首頁暫以預設項目判斷。', error)
    return getTrainingProgramFallbackSettings()
  })
  const activeNormalizedSnapshot = await filterActiveSnapshotMembers(normalizeSnapshot(payload))
  const normalizedSnapshot = enrichSnapshotWithTrainingPrograms(activeNormalizedSnapshot, programSettings)
  const snapshotWithLocations = await enrichSnapshotWithTrainingLocations(
    normalizedSnapshot,
    payload,
    today
  )
  const snapshot = await enrichSnapshotWithTrainingMonthDates(snapshotWithLocations, payload, programSettings, today)

  const withTrainingPoints = await enrichMembersWithTrainingPoints(snapshot, rawMembers)
  const activeSnapshot = await filterActiveSnapshotMembers(withTrainingPoints)
  const activeSnapshotWithPrograms = enrichSnapshotWithTrainingPrograms(activeSnapshot, programSettings)
  const snapshotWithLeaveSegments = await enrichSnapshotWithLeaveSegments(activeSnapshotWithPrograms)

  return enrichSnapshotWithMatchFees(snapshotWithLeaveSegments)
}
