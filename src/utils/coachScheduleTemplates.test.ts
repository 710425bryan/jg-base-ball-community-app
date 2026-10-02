import { describe, expect, it } from 'vitest'
import { normalizeCoachScheduleEvent } from './coachSchedules'
import {
  canCopyCoachScheduleTemplate, copyCoachScheduleTemplate, createCoachScheduleTemplate,
  normalizeCoachScheduleAutoFillPreview, normalizeCoachScheduleTemplates, normalizeCoachScheduleTemplateVenues
} from './coachScheduleTemplates'

describe('coachScheduleTemplates', () => {
  it('starts an enabled venue template with an optional name and independent coach array', () => {
    const first = createCoachScheduleTemplate()
    expect(first).toEqual({ id: null, updated_at: null, name: '', is_active: true, match_mode: 'venue',
      venue_id: null, venue_name: '', coach_profile_ids: [] })
    first.coach_profile_ids.push('a')
    expect(createCoachScheduleTemplate().coach_profile_ids).toEqual([])
  })
  it('copies only the venue and coaches, without requiring a time or carrying activity conditions', () => {
    const event = normalizeCoachScheduleEvent({ id: 'saved', updated_at: 'revision', source_type: 'training_location', venue_id: 'physical',
      source_venue_id: 'block', schedule_date: '2026-10-03', title: '投捕訓練', location: ' 中港國小 ', coach_profile_ids: ['a'] })
    const template = copyCoachScheduleTemplate(event)
    expect(template).toEqual({ id: null, updated_at: null, name: '', is_active: true, match_mode: 'venue',
      venue_id: 'physical', venue_name: '中港國小', coach_profile_ids: ['a'] })
    template.coach_profile_ids.push('b')
    expect(event.coach_profile_ids).toEqual(['a'])
  })
  it('uses an enriched training-date venue ID, otherwise keeps a typed name or empty required venue', () => {
    expect(copyCoachScheduleTemplate(normalizeCoachScheduleEvent({ source_type: 'training_date', venue_id: 'enriched', location: '河濱球場' })))
      .toMatchObject({ venue_id: 'enriched', venue_name: '河濱球場' })
    expect(copyCoachScheduleTemplate(normalizeCoachScheduleEvent({ source_type: 'training_date', location: ' 河濱球場 ' })))
      .toMatchObject({ venue_id: null, venue_name: '河濱球場' })
    expect(copyCoachScheduleTemplate(normalizeCoachScheduleEvent({ source_type: 'training_location' })))
      .toMatchObject({ venue_id: null, venue_name: '' })
  })
  it('rejects match, manual and training-class sources without inferring a venue rule', () => {
    for (const source_type of ['match', 'manual', 'training_class']) {
      const event = normalizeCoachScheduleEvent({ source_type, location: '中港國小', start_time: '09:00' })
      expect(canCopyCoachScheduleTemplate(event)).toBe(false)
      expect(() => copyCoachScheduleTemplate(event)).toThrow('只有訓練日期與場地訓練活動')
    }
  })
  it('strictly accepts venue-mode rows and preserves disabled venue state without upgrading legacy templates', () => {
    const valid = { id: 't', match_mode: 'venue', venue_id: 'v', venue_name: ' 中港國小 ', is_active: false,
      venue_is_active: false, coach_profile_ids: ['a', 'a'], updated_at: 'revision' }
    expect(normalizeCoachScheduleTemplates([valid, { ...valid, match_mode: 'exact' }, { ...valid, match_mode: undefined },
      { ...valid, venue_id: null }, { ...valid, venue_name: '' }, null, 123])).toEqual([{
      id: 't', match_mode: 'venue', venue_id: 'v', venue_name: '中港國小', name: '中港國小',
      is_active: false, venue_is_active: false, coach_profile_ids: ['a'], updated_at: 'revision'
    }])
    expect(normalizeCoachScheduleTemplates([{ ...valid, is_active: undefined, venue_is_active: undefined }])[0])
      .toMatchObject({ is_active: false, venue_is_active: false })
  })
  it('normalizes the independent active venue dictionary without inventing missing IDs or names', () => {
    expect(normalizeCoachScheduleTemplateVenues([{ id: 'v', name: ' 中港國小 ' }, { id: 'r', name: '河濱球場' },
      { id: 'v', name: '中港國小' }, { id: '', name: '失效' }, { id: 'bad' }, null]))
      .toEqual([{ id: 'v', name: '中港國小' }, { id: 'r', name: '河濱球場' }])
  })
  it('preserves server preview exclusions, vacancies and unknown-time safety', () => {
    const preview = normalizeCoachScheduleAutoFillPreview({ fingerprint: 'revision', rows: [{
      event_key: 'date', event: { source_type: 'training_date', schedule_date: '2026-10-03' },
      proposed_coach_profile_ids: [], excluded_coaches: [{ id: 'a', name: '教練', reason: 'leave' }],
      vacancy_count: 1, time_incomplete: true
    }] })
    expect(preview.rows[0]).toMatchObject({ proposed_coach_profile_ids: [], vacancy_count: 1, time_incomplete: true,
      excluded_coaches: [{ id: 'a', name: '教練', reason: 'leave' }] })
  })
})
