import { supabase } from '@/services/supabase'
import type {
  CoachLeaveBatchCreateInput, CoachLeaveListFilters, CoachLeaveSaveInput, CoachLeaveTrainingDates
} from '@/types/coachLeaveRequest'
import { normalizeCoachLeaveList, normalizeCoachLeaveError } from '@/utils/coachLeaveRequests'
import { normalizeCoachLeaveClassDates } from '@/utils/coachLeaveDateSelection'

const assertSession = async () => {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new Error('登入狀態已過期，請重新登入後再試。')
}

export const coachLeaveRequestsApi = {
  async trainingDates(month: string, manage = false): Promise<CoachLeaveTrainingDates> {
    await assertSession()
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('請選擇有效的月份。')
    const { data, error } = await supabase.rpc('list_coach_leave_training_dates', {
      p_month: `${month}-01`, p_manage: manage
    })
    if (error) throw new Error(normalizeCoachLeaveError(error))
    const programs = Array.isArray(data?.programs) ? data.programs : []
    const seen = new Set<string>()
    return {
      month_start: `${month}-01`,
      programs: programs.flatMap((row: Record<string, unknown>) => {
        if (!row || typeof row !== 'object') return []
        const key = String(row.program_key || '').trim()
        if (!key || seen.has(key)) return []
        seen.add(key)
        const dates = Array.isArray(row.training_dates) ? row.training_dates : []
        return [{
          program_key: key, program_label: String(row.program_label || key),
          training_dates: normalizeCoachLeaveClassDates(dates, month)
        }]
      })
    }
  },

  async createBatch(input: CoachLeaveBatchCreateInput, manage: boolean, batchId: string) {
    await assertSession()
    const { data, error } = await supabase.rpc('create_coach_leave_requests', {
      p_leaves: input.records.map((record) => ({
        ...(manage ? { coach_profile_id: input.coach_profile_id || null } : {}),
        start_date: record.start_date, end_date: record.end_date,
        time_segment: record.time_segment, reason: input.reason?.trim() || null
      })),
      p_manage: manage, p_batch_id: batchId
    })
    if (error) throw new Error(normalizeCoachLeaveError(error))
    if (!Array.isArray(data) || !data.length || data.some((id) => typeof id !== 'string' || !id)) {
      throw new Error('無法確認假單送出結果，請保留表單並重試。')
    }
    return data as string[]
  },

  async list(filters: CoachLeaveListFilters = {}) {
    await assertSession()
    const { data, error } = await supabase.rpc('list_coach_leave_requests', {
      p_month: filters.month ? `${filters.month.slice(0, 7)}-01` : null,
      p_status: filters.status || 'all',
      p_coach_profile_id: filters.manage ? filters.coachProfileId || null : null,
      p_manage: filters.manage === true
    })
    if (error) throw new Error(normalizeCoachLeaveError(error))
    return normalizeCoachLeaveList(data)
  },

  async save(input: CoachLeaveSaveInput, manage = false, requestId: string | null = null) {
    await assertSession()
    const { data, error } = await supabase.rpc('save_coach_leave_request', {
      p_leave: {
        id: input.id || null,
        updated_at: input.updated_at || null,
        ...(manage ? { coach_profile_id: input.coach_profile_id || null } : {}),
        start_date: input.start_date,
        end_date: input.end_date,
        time_segment: input.time_segment,
        reason: input.reason?.trim() || null
      },
      p_manage: manage,
      p_request_id: input.id ? null : requestId
    })
    if (error) throw new Error(normalizeCoachLeaveError(error))
    return String(data || '')
  },

  async cancel(leaveId: string, updatedAt: string, manage = false) {
    await assertSession()
    const { error } = await supabase.rpc('cancel_coach_leave_request', {
      p_leave_id: leaveId,
      p_updated_at: updatedAt,
      p_manage: manage
    })
    if (error) throw new Error(normalizeCoachLeaveError(error))
  }
}
