import { supabase } from '@/services/supabase'
import type {
  TrainingAdminRegistration,
  TrainingMember,
  TrainingPointTransaction,
  TrainingRegistrationStatus,
  TrainingSession,
  TrainingSessionCreateInput,
  TrainingSessionSettingsInput
} from '@/types/training'
import { normalizeTrainingSelectedMembers } from '@/utils/training'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) return [] as T[]
  return Array.isArray(data) ? data : [data]
}

const normalizeTaipeiDateTimeForRpc = (value?: string | null) => {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(normalized)) return normalized
  return `${normalized.replace(' ', 'T')}+08:00`
}

const normalizeTrainingSession = (row: any): TrainingSession => ({
  session_id: row?.session_id || null,
  match_id: String(row?.match_id || ''),
  match_name: String(row?.match_name || ''),
  match_date: String(row?.match_date || ''),
  match_time: row?.match_time ? String(row.match_time) : null,
  location: row?.location ? String(row.location) : null,
  category_group: row?.category_group ? String(row.category_group) : null,
  manual_status: row?.manual_status || 'draft',
  registration_start_at: row?.registration_start_at || null,
  registration_end_at: row?.registration_end_at || null,
  capacity: row?.capacity === null || row?.capacity === undefined ? null : Number(row.capacity),
  point_cost: Number(row?.point_cost || 0),
  published_at: row?.published_at || null,
  selected_count: Number(row?.selected_count || 0),
  applied_count: Number(row?.applied_count || 0),
  is_registration_open: Boolean(row?.is_registration_open),
  registration_id: row?.registration_id || null,
  registration_status: row?.registration_status || null,
  point_status: row?.point_status || null,
  is_blocked: Boolean(row?.is_blocked),
  block_reason: row?.block_reason || null,
  selected_members: normalizeTrainingSelectedMembers(row?.selected_members)
})

const normalizeTrainingMember = (row: any): TrainingMember => ({
  member_id: String(row?.member_id || ''),
  name: String(row?.name || ''),
  role: row?.role ? String(row.role) : null,
  team_group: row?.team_group ? String(row.team_group) : null,
  point_balance: Number(row?.point_balance || 0),
  reserved_points: Number(row?.reserved_points || 0),
  available_points: Number(row?.available_points || 0),
  active_block_count: Number(row?.active_block_count || 0)
})

export const trainingApi = {
  async listMyTrainingMembers() {
    const { data, error } = await supabase.rpc('list_my_training_members')
    if (error) throw error
    return unwrapRows<TrainingMember>(data).map(normalizeTrainingMember)
  },

  async listTrainingSessions(memberId?: string | null) {
    const { data, error } = await supabase.rpc('list_training_sessions', {
      p_member_id: memberId || null
    })
    if (error) throw error
    return unwrapRows<TrainingSession>(data).map(normalizeTrainingSession)
  },

  async createRegistration(sessionId: string, memberId: string, note?: string | null) {
    const { data, error } = await supabase.rpc('create_training_registration', {
      p_session_id: sessionId,
      p_member_id: memberId,
      p_note: note || null
    })
    if (error) throw error
    return data
  },

  async cancelRegistration(registrationId: string) {
    const { data, error } = await supabase.rpc('cancel_training_registration', {
      p_registration_id: registrationId
    })
    if (error) throw error
    return data
  },

  async saveSessionSettings(input: TrainingSessionSettingsInput) {
    const { data, error } = await supabase.rpc('upsert_training_session_settings', {
      p_match_id: input.match_id,
      p_registration_start_at: normalizeTaipeiDateTimeForRpc(input.registration_start_at),
      p_registration_end_at: normalizeTaipeiDateTimeForRpc(input.registration_end_at),
      p_manual_status: input.manual_status,
      p_capacity: input.capacity ?? null,
      p_point_cost: input.point_cost ?? 1
    })
    if (error) throw error
    return data
  },

  async createSessionWithMatch(input: TrainingSessionCreateInput) {
    const { data, error } = await supabase.rpc('create_training_match_with_settings', {
      p_match_name: input.match_name,
      p_match_date: input.match_date,
      p_match_time: input.match_time || null,
      p_location: input.location || null,
      p_category_group: input.category_group || null,
      p_registration_start_at: normalizeTaipeiDateTimeForRpc(input.registration_start_at),
      p_registration_end_at: normalizeTaipeiDateTimeForRpc(input.registration_end_at),
      p_manual_status: input.manual_status,
      p_capacity: input.capacity ?? null,
      p_point_cost: input.point_cost ?? 1
    })
    if (error) throw error
    return data
  },

  async listAdminRegistrations(sessionId: string) {
    const { data, error } = await supabase.rpc('list_training_admin_registrations', {
      p_session_id: sessionId
    })
    if (error) throw error
    return unwrapRows<TrainingAdminRegistration>(data)
  },

  async reviewRegistration(registrationId: string, status: TrainingRegistrationStatus, note?: string | null) {
    const { data, error } = await supabase.rpc('review_training_registration', {
      p_registration_id: registrationId,
      p_status: status,
      p_note: note || null
    })
    if (error) throw error
    return data
  },

  async publishSelection(sessionId: string) {
    const { data, error } = await supabase.rpc('publish_training_selection', {
      p_session_id: sessionId
    })
    if (error) throw error
    return data
  },

  async grantPoints(memberIds: string[], delta: number, reason?: string | null) {
    const { data, error } = await supabase.rpc('grant_player_points', {
      p_member_ids: memberIds,
      p_delta: delta,
      p_reason: reason || null
    })
    if (error) throw error
    return unwrapRows<TrainingPointTransaction>(data)
  },

  async listPointTransactions(memberId?: string | null) {
    const { data, error } = await supabase.rpc('list_player_point_transactions', {
      p_member_id: memberId || null
    })
    if (error) throw error
    return unwrapRows<TrainingPointTransaction>(data)
  },

  async createAttendanceEvent(sessionId: string) {
    const { data, error } = await supabase.rpc('create_training_attendance_event', {
      p_session_id: sessionId
    })
    if (error) throw error
    return String(data || '')
  },

  async applyAttendanceResult(eventId: string, memberId: string, status: string) {
    const { error } = await supabase.rpc('apply_training_attendance_result', {
      p_event_id: eventId,
      p_member_id: memberId,
      p_status: status
    })
    if (error) throw error
  },

  async processAutomation(today?: string | null) {
    const { data, error } = await supabase.rpc('process_training_session_automation', {
      p_today: today || null
    })
    if (error) throw error
    return data
  }
}
