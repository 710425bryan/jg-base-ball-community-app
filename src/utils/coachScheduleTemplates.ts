import type { CoachScheduleEvent } from '@/types/coachSchedule'
import type { CoachScheduleAutoFillPreview, CoachScheduleTemplate, CoachScheduleTemplateInput, CoachScheduleTemplateVenue } from '@/types/coachScheduleTemplate'
import { normalizeCoachScheduleEvent } from './coachSchedules'

const strings = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))]
  : []

export const createCoachScheduleTemplate = (): CoachScheduleTemplateInput => ({
  id: null, updated_at: null, name: '', is_active: true, match_mode: 'venue',
  venue_id: null, venue_name: '', coach_profile_ids: []
})

export const canCopyCoachScheduleTemplate = (event: CoachScheduleEvent) =>
  event.source_type === 'training_date' || event.source_type === 'training_location'

export const copyCoachScheduleTemplate = (event: CoachScheduleEvent): CoachScheduleTemplateInput => {
  if (!canCopyCoachScheduleTemplate(event)) throw new Error('只有訓練日期與場地訓練活動可建立固定範本。')
  return {
    ...createCoachScheduleTemplate(),
    venue_id: event.venue_id || null,
    venue_name: event.location?.trim() || '',
    coach_profile_ids: strings(event.coach_profile_ids)
  }
}

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null
const textValue = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export const normalizeCoachScheduleTemplateVenues = (value: unknown): CoachScheduleTemplateVenue[] => {
  const venues = new Map<string, CoachScheduleTemplateVenue>()
  for (const item of Array.isArray(value) ? value : []) {
    const row = record(item)
    const id = textValue(row?.id)
    const name = textValue(row?.name)
    if (id && name) venues.set(id, { id, name })
  }
  return [...venues.values()]
}

export const normalizeCoachScheduleTemplates = (value: unknown): CoachScheduleTemplate[] =>
  (Array.isArray(value) ? value : []).flatMap((item) => {
    const row = record(item)
    // An older exact-match template must never become a venue-wide rule by inference.
    if (!row || row.match_mode !== 'venue' || !textValue(row.id) || !textValue(row.venue_id) || !textValue(row.venue_name)) return []
    return [{
      id: textValue(row.id), name: textValue(row.name) || textValue(row.venue_name),
      is_active: row.is_active === true, match_mode: 'venue' as const,
      venue_id: textValue(row.venue_id), venue_name: textValue(row.venue_name),
      venue_is_active: row.venue_is_active === true,
      coach_profile_ids: strings(row.coach_profile_ids),
      updated_at: textValue(row.updated_at) || null
    }]
  })

export const normalizeCoachScheduleAutoFillPreview = (value: any): CoachScheduleAutoFillPreview => ({
  fingerprint: String(value?.fingerprint || ''),
  rows: (Array.isArray(value?.rows) ? value.rows : []).map((row: any) => ({
    event_key: String(row.event_key || ''),
    event: normalizeCoachScheduleEvent(row.event),
    template_id: String(row.template_id || ''),
    template_name: String(row.template_name || ''),
    proposed_coach_profile_ids: strings(row.proposed_coach_profile_ids),
    excluded_coaches: (Array.isArray(row.excluded_coaches) ? row.excluded_coaches : []).map((coach: any) => ({
      id: String(coach.id || ''), name: String(coach.name || ''), reason: String(coach.reason || '')
    })),
    vacancy_count: Math.max(0, Number(row.vacancy_count) || 0),
    time_incomplete: Boolean(row.time_incomplete)
  })).filter((row: { event_key: string }) => row.event_key)
})

export const getCoachScheduleExclusionLabel = (reason: string) => ({
  leave: '請假', on_leave: '請假', coach_leave: '請假', inactive: '帳號停用',
  invalid_coach: '非有效教練', unavailable: '無法排班', access_window: '不在可登入期間',
  time_overlap: '與其他排班衝突', conflict: '與其他排班衝突'
}[reason] || reason || '無法排班')
