import { supabase } from '@/services/supabase'
import type { CoachScheduleTemplate, CoachScheduleTemplateInput } from '@/types/coachScheduleTemplate'
import { getCoachScheduleMonthStart } from '@/utils/coachSchedules'
import { normalizeCoachScheduleAutoFillPreview, normalizeCoachScheduleTemplates, normalizeCoachScheduleTemplateVenues } from '@/utils/coachScheduleTemplates'

const callRpc = async (name: string, args?: Record<string, unknown>) => {
  const session = await supabase.auth.getSession()
  if (session.error || !session.data.session?.access_token) throw new Error('登入狀態已過期，請重新登入後再試。')
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export const coachScheduleTemplatesApi = {
  async list() {
    return normalizeCoachScheduleTemplates(await callRpc('list_coach_schedule_templates'))
  },
  async listVenues() {
    return normalizeCoachScheduleTemplateVenues(await callRpc('list_coach_schedule_template_venues'))
  },
  async save(template: CoachScheduleTemplateInput) {
    if (template.match_mode !== 'venue') throw new Error('此範本格式已不支援，請重新建立場地範本。')
    const venueId = template.venue_id?.trim() || null
    const input = {
      id: template.id, updated_at: template.updated_at, match_mode: 'venue',
      name: template.name.trim(), is_active: template.is_active,
      coach_profile_ids: [...new Set(template.coach_profile_ids)],
      ...(venueId ? { venue_id: venueId } : { venue_name: template.venue_name.trim() })
    }
    return String(await callRpc('save_coach_schedule_template', { p_template: input }))
  },
  async delete(template: CoachScheduleTemplate) {
    await callRpc('delete_coach_schedule_template', { p_template_id: template.id, p_updated_at: template.updated_at })
  },
  async preview(month: string) {
    return normalizeCoachScheduleAutoFillPreview(await callRpc('preview_coach_schedule_auto_fill', {
      p_month: getCoachScheduleMonthStart(month)
    }))
  },
  async confirm(month: string, fingerprint: string, eventKeys: string[]) {
    const data = await callRpc('confirm_coach_schedule_auto_fill', {
      p_month: getCoachScheduleMonthStart(month), p_fingerprint: fingerprint,
      p_event_keys: [...new Set(eventKeys)]
    })
    return Array.isArray(data) ? data.map(String) : []
  }
}
