import { describe, expect, it } from 'vitest'
import { normalizeCoachScheduleEvent } from './coachSchedules'
import { buildCoachScheduleMonthOverview } from './coachScheduleMonthOverview'

const event = (input: Record<string, unknown>) => normalizeCoachScheduleEvent({
  source_type: 'manual', schedule_date: '2026-10-03', ...input
})

describe('coachScheduleMonthOverview', () => {
  it('groups all sources from month start to end, including cancelled and unassigned candidates', () => {
    const events = [event({ id: 'last', schedule_date: '2026-10-31', source_type: 'match', title: '月底比賽' }),
      event({ id: 'first', schedule_date: '2026-10-01', source_type: 'training_location', title: '月初場地' }),
      event({ source_type: 'training_date', title: '週六訓練' }),
      event({ id: 'special', source_type: 'training_class', title: '特訓課', status: 'cancelled' }),
      event({ id: 'manual', title: '補課' })]
    const groups = buildCoachScheduleMonthOverview(events, '2026-10')
    expect(groups.map((group) => group.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-31'])
    expect(groups.flatMap((group) => group.rows).map((row) => row.event.source_type).sort())
      .toEqual(['manual', 'match', 'training_class', 'training_date', 'training_location'])
    expect(groups.flatMap((group) => group.rows).find((row) => row.event.id === 'special')?.event.status).toBe('cancelled')
  })

  it('keeps same-day different venues and orders times ascending with unknown times last and stable ties', () => {
    const events = [event({ id: 'unknown', title: '0未定', start_time: null }),
      event({ id: 'late', title: '晚間', start_time: '23:59:00' }),
      event({ id: 'b', title: '同一課程', location: 'B球場', start_time: '09:00' }),
      event({ id: 'a', title: '同一課程', location: 'A球場', start_time: '09:00' }),
      event({ id: 'early', title: '晨間', start_time: '08:30:00' })]
    const rows = buildCoachScheduleMonthOverview(events, '2026-10')[0]!.rows
    expect(rows.map((row) => row.event.id)).toEqual(['early', 'a', 'b', 'late', 'unknown'])
    expect(buildCoachScheduleMonthOverview([...events].reverse(), '2026-10')[0]!.rows).toEqual(rows)
  })

  it('filters other months and invalid dates instead of moving an invalid day into the next month', () => {
    const events = ['2026-09-30', '2026-10-01', '2026-10-31', '2026-10-32', '2026-11-01', '2026-10-03T00:00:00Z', ''].map((schedule_date) => event({ schedule_date }))
    expect(buildCoachScheduleMonthOverview(events, '2026-10').map((group) => group.date)).toEqual(['2026-10-01', '2026-10-31'])
    expect(buildCoachScheduleMonthOverview([event({ schedule_date: '2026-02-30' })], '2026-02')).toEqual([])
  })

  it('shows saved assignment names only for saved coach IDs, deduplicates IDs and never exposes raw UUIDs', () => {
    const saved = event({ id: 'saved', coach_profile_ids: ['coach-a', 'coach-b', 'missing', 'coach-a'], assignments: [
      { coach_profile_id: 'coach-a', coach_name: '甲教練', coach_nickname: '  阿甲  ' },
      { coach_profile_id: 'coach-b', coach_name: '乙教練', coach_nickname: null }
    ] })
    saved.assignments.push({ ...saved.assignments[0]!, coach_profile_id: 'not-assigned', coach_name: '不應顯示' })
    expect(buildCoachScheduleMonthOverview([saved], '2026-10')[0]!.rows[0]!.coachNames)
      .toEqual(['阿甲', '乙教練', '教練（姓名未提供）'])
  })

  it('never treats candidate coach IDs, legacy coach text or UI draft metadata as saved assignments', () => {
    const candidate = event({ title: '候選活動', coach_profile_ids: ['draft'], legacy_coaches: '比賽參考教練',
      assignments: [{ coach_profile_id: 'draft', coach_name: '草稿教練' }] })
    const emptySaved = event({ id: 'empty', coach_profile_ids: [], legacy_coaches: '參考文字' })
    expect(candidate.is_persisted).toBe(false)
    expect(buildCoachScheduleMonthOverview([candidate, emptySaved], '2026-10')[0]!.rows.map((row) => row.coachNames)).toEqual([[], []])
  })

  it('does not mutate input events, assignment arrays or ordering and returns no empty date groups', () => {
    const events = [event({ id: 'late', schedule_date: '2026-10-31' }), event({ id: 'early', schedule_date: '2026-10-01' })]
    const before = structuredClone(events)
    for (const row of events) { Object.freeze(row.coach_profile_ids); Object.freeze(row.assignments); Object.freeze(row) }
    buildCoachScheduleMonthOverview(Object.freeze(events), '2026-10')
    expect(events).toEqual(before)
    expect(buildCoachScheduleMonthOverview([], '2026-10')).toEqual([])
  })
})
