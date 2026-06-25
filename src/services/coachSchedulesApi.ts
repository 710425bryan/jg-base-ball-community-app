import { supabase } from '@/services/supabase'
import type {
  CoachScheduleMonthPayload,
  CoachScheduleSaveInput,
  SchedulableCoach
} from '@/types/coachSchedule'
import {
  getCoachScheduleMonthStart,
  normalizeCoachScheduleMonthPayload,
  normalizeSchedulableCoaches
} from '@/utils/coachSchedules'

const ensureAuthenticatedSession = async () => {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new Error('登入狀態已過期，請重新登入後再試。')
  }

  return data.session
}

const normalizeCoachScheduleError = (error: any) => {
  if (String(error?.message || '').includes('Not authenticated')) {
    return new Error('登入狀態已過期，請重新登入後再試。')
  }

  return error
}

export const coachSchedulesApi = {
  async listAdminMonth(month?: string | null): Promise<CoachScheduleMonthPayload> {
    await ensureAuthenticatedSession()

    const monthStart = getCoachScheduleMonthStart(month)
    const { data, error } = await supabase.rpc('list_coach_schedule_admin_month', {
      p_month: monthStart
    })

    if (error) throw normalizeCoachScheduleError(error)
    return normalizeCoachScheduleMonthPayload(data, monthStart)
  },

  async listDashboardMonth(month?: string | null): Promise<CoachScheduleMonthPayload> {
    await ensureAuthenticatedSession()

    const monthStart = getCoachScheduleMonthStart(month)
    const { data, error } = await supabase.rpc('list_coach_schedule_dashboard', {
      p_month: monthStart
    })

    if (error) throw normalizeCoachScheduleError(error)
    return normalizeCoachScheduleMonthPayload(data, monthStart)
  },

  async listSchedulableCoaches(): Promise<SchedulableCoach[]> {
    await ensureAuthenticatedSession()

    const { data, error } = await supabase.rpc('list_schedulable_coaches')
    if (error) throw normalizeCoachScheduleError(error)
    return normalizeSchedulableCoaches(data)
  },

  async saveEvent(input: CoachScheduleSaveInput): Promise<string> {
    await ensureAuthenticatedSession()

    const { data, error } = await supabase.rpc('save_coach_schedule_event', {
      p_event: {
        id: input.id || null,
        source_type: input.source_type,
        source_id: input.source_id || null,
        source_venue_id: input.source_venue_id || null,
        schedule_date: input.schedule_date,
        start_time: input.start_time || null,
        end_time: input.end_time || null,
        title: input.title,
        location: input.location || null,
        location_url: input.location_url || null,
        legacy_coaches: input.legacy_coaches || null,
        status: input.status || 'scheduled',
        note: input.note || null
      },
      p_coach_profile_ids: input.coach_profile_ids
    })

    if (error) throw normalizeCoachScheduleError(error)
    return String(data || '')
  },

  async deleteEvent(eventId: string): Promise<void> {
    await ensureAuthenticatedSession()

    const { error } = await supabase.rpc('delete_coach_schedule_event', {
      p_event_id: eventId
    })

    if (error) throw normalizeCoachScheduleError(error)
  }
}

export const listCoachScheduleDashboardMonth = (month?: string | null) =>
  coachSchedulesApi.listDashboardMonth(month)
