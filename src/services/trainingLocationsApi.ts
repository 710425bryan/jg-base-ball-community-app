import { supabase } from '@/services/supabase'
import type {
  TrainingLocationDispatchResult,
  TrainingLocationRosterMember,
  TrainingLocationSession,
  TrainingLocationSessionSaveInput,
  TrainingLocationSessionVenue,
  TrainingLocationSessionStatus,
  TrainingVenue
} from '@/types/trainingLocation'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) return [] as T[]
  return Array.isArray(data) ? data : [data]
}

export class TrainingLocationAuthError extends Error {
  code = 'AUTH_REQUIRED'

  constructor() {
    super('登入狀態已過期，請重新登入後再試。')
    this.name = 'TrainingLocationAuthError'
  }
}

const ensureAuthenticatedSession = async () => {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new TrainingLocationAuthError()
  }

  return data.session
}

const normalizeTrainingLocationError = (error: any) => {
  if (String(error?.message || '').includes('Not authenticated')) {
    return new TrainingLocationAuthError()
  }

  return error
}

const normalizeNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeMemberIds = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []

const normalizeVenue = (row: any): TrainingVenue => ({
  id: String(row?.id || ''),
  name: String(row?.name || ''),
  address: row?.address ? String(row.address) : null,
  maps_url: row?.maps_url ? String(row.maps_url) : null,
  sort_order: normalizeNumber(row?.sort_order),
  is_active: row?.is_active !== false
})

const normalizeRosterMember = (row: any): TrainingLocationRosterMember => ({
  member_id: String(row?.member_id || ''),
  name: String(row?.name || ''),
  role: row?.role ? String(row.role) : null,
  team_group: row?.team_group ? String(row.team_group) : null,
  jersey_number: row?.jersey_number === null || row?.jersey_number === undefined
    ? null
    : String(row.jersey_number),
  is_on_leave: Boolean(row?.is_on_leave)
})

const normalizeSessionVenue = (row: any): TrainingLocationSessionVenue => ({
  id: row?.id ? String(row.id) : null,
  venue_id: row?.venue_id ? String(row.venue_id) : null,
  venue_name: String(row?.venue_name || ''),
  venue_address: row?.venue_address ? String(row.venue_address) : null,
  venue_maps_url: row?.venue_maps_url ? String(row.venue_maps_url) : null,
  sort_order: normalizeNumber(row?.sort_order),
  note: row?.note ? String(row.note) : null,
  member_ids: normalizeMemberIds(row?.member_ids),
  assignments: unwrapRows<any>(row?.assignments).map(normalizeRosterMember)
})

const normalizeSessionStatus = (value: unknown): TrainingLocationSessionStatus => {
  if (value === 'published' || value === 'archived') return value
  return 'draft'
}

const normalizeSession = (row: any): TrainingLocationSession => ({
  session_id: String(row?.session_id || ''),
  title: String(row?.title || ''),
  training_date: String(row?.training_date || ''),
  start_time: row?.start_time ? String(row.start_time) : null,
  end_time: row?.end_time ? String(row.end_time) : null,
  status: normalizeSessionStatus(row?.status),
  note: row?.note ? String(row.note) : null,
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
  venue_count: normalizeNumber(row?.venue_count),
  assignment_count: normalizeNumber(row?.assignment_count),
  venues: unwrapRows<any>(row?.venues).map(normalizeSessionVenue)
})

export const trainingLocationsApi = {
  async listVenues() {
    await ensureAuthenticatedSession()
    const { data, error } = await supabase.rpc('list_training_venues')
    if (error) throw normalizeTrainingLocationError(error)
    return unwrapRows<TrainingVenue>(data).map(normalizeVenue)
  },

  async upsertVenue(input: Partial<TrainingVenue> & { name: string }) {
    await ensureAuthenticatedSession()
    const { data, error } = await supabase.rpc('upsert_training_venue', {
      p_id: input.id || null,
      p_name: input.name,
      p_address: input.address || null,
      p_maps_url: input.maps_url || null,
      p_is_active: input.is_active !== false,
      p_sort_order: input.sort_order ?? 0
    })
    if (error) throw normalizeTrainingLocationError(error)
    return normalizeVenue(data)
  },

  async listSessions(from?: string | null, to?: string | null) {
    await ensureAuthenticatedSession()
    const { data, error } = await supabase.rpc('list_training_location_admin_sessions', {
      p_from: from || null,
      p_to: to || null
    })
    if (error) throw normalizeTrainingLocationError(error)
    return unwrapRows<TrainingLocationSession>(data).map(normalizeSession)
  },

  async listRoster(trainingDate: string) {
    await ensureAuthenticatedSession()
    const { data, error } = await supabase.rpc('list_training_location_roster', {
      p_training_date: trainingDate
    })
    if (error) throw normalizeTrainingLocationError(error)
    return unwrapRows<TrainingLocationRosterMember>(data).map(normalizeRosterMember)
  },

  async saveSession(input: TrainingLocationSessionSaveInput) {
    await ensureAuthenticatedSession()
    const { data, error } = await supabase.rpc('save_training_location_session', {
      p_session_id: input.session_id || null,
      p_title: input.title,
      p_training_date: input.training_date,
      p_start_time: input.start_time || null,
      p_end_time: input.end_time || null,
      p_status: input.status,
      p_note: input.note || null,
      p_venues: input.venues
    })
    if (error) throw normalizeTrainingLocationError(error)
    return String(data || '')
  },

  async publishSession(sessionId: string) {
    await ensureAuthenticatedSession()
    const { error } = await supabase.rpc('publish_training_location_session', {
      p_session_id: sessionId
    })
    if (error) throw normalizeTrainingLocationError(error)
  },

  async deleteSession(sessionId: string) {
    await ensureAuthenticatedSession()
    const { error } = await supabase.rpc('delete_training_location_session', {
      p_session_id: sessionId
    })
    if (error) throw normalizeTrainingLocationError(error)
  },

  async dispatchNotifications(options: { targetDate?: string | null; sessionId?: string | null; dryRun?: boolean } = {}) {
    const session = await ensureAuthenticatedSession()
    const { data, error } = await supabase.functions.invoke<TrainingLocationDispatchResult>('send-training-location-notifications', {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      },
      body: {
        target_date: options.targetDate || null,
        session_id: options.sessionId || null,
        dry_run: options.dryRun === true
      }
    })

    if (error) throw normalizeTrainingLocationError(error)
    return data
  }
}
