import { describe, expect, it } from 'vitest'
import {
  formatCoachScheduleDateLabel,
  formatCoachScheduleTimeRange,
  getCoachScheduleSourceLabel,
  mergeCoachScheduleEvents,
  normalizeCoachScheduleEvent,
  normalizeCoachScheduleMonthPayload,
  normalizeSchedulableCoaches,
  sortCoachScheduleEvents
} from './coachSchedules'
import type { CoachScheduleEvent } from '@/types/coachSchedule'

const makeEvent = (overrides: Partial<CoachScheduleEvent>): CoachScheduleEvent => ({
  id: null,
  is_persisted: false,
  is_candidate: true,
  source_type: 'training_date',
  source_id: null,
  source_venue_id: null,
  schedule_date: '2026-04-04',
  start_time: '09:00',
  end_time: '12:30',
  title: '週六訓練',
  location: '中港國小',
  location_url: null,
  legacy_coaches: null,
  status: 'scheduled',
  note: null,
  coach_profile_ids: [],
  assignments: [],
  created_at: null,
  updated_at: null,
  ...overrides
})

describe('coachSchedules utilities', () => {
  it('normalizes RPC event rows and keeps assignment coach IDs', () => {
    const event = normalizeCoachScheduleEvent({
      id: 'event-1',
      source_type: 'training_location',
      schedule_date: '2026-04-11',
      title: '內野訓練',
      coach_profile_ids: ['coach-a'],
      assignments: [
        {
          id: 'assignment-1',
          event_id: 'event-1',
          coach_profile_id: 'coach-b',
          coach_name: '王教練',
          coach_nickname: '阿王'
        }
      ]
    })

    expect(event.id).toBe('event-1')
    expect(event.source_type).toBe('training_location')
    expect(event.coach_profile_ids).toEqual(['coach-a', 'coach-b'])
    expect(event.assignments[0].coach_nickname).toBe('阿王')
  })

  it('formats source labels, date labels, and time ranges', () => {
    expect(getCoachScheduleSourceLabel('training_date')).toBe('週六訓練')
    expect(getCoachScheduleSourceLabel('training_class')).toBe('特訓課')
    expect(formatCoachScheduleDateLabel('2026-04-04')).toBe('4/4 週六')
    expect(formatCoachScheduleTimeRange(makeEvent({ start_time: '09:00', end_time: '12:30' }))).toBe('09:00 - 12:30')
    expect(formatCoachScheduleTimeRange(makeEvent({ start_time: null, end_time: null }))).toBe('時間未定')
  })

  it('normalizes schedulable coaches from array or stringified JSON payloads', () => {
    expect(normalizeSchedulableCoaches([
      { id: 'coach-a', name: '王教練', role: 'COACH' }
    ])).toEqual([
      {
        id: 'coach-a',
        name: '王教練',
        nickname: null,
        role: 'COACH',
        avatar_url: null
      }
    ])

    expect(normalizeSchedulableCoaches('[{"id":"coach-b","name":"林教練","role":"COACH"}]')[0]).toMatchObject({
      id: 'coach-b',
      name: '林教練',
      role: 'COACH'
    })
  })

  it('sorts by month day, start time, source priority, and title', () => {
    const sorted = sortCoachScheduleEvents([
      makeEvent({ source_type: 'match', schedule_date: '2026-04-04', start_time: '10:00', title: '比賽' }),
      makeEvent({ source_type: 'training_location', schedule_date: '2026-04-04', start_time: '09:00', title: '外野' }),
      makeEvent({ source_type: 'training_date', schedule_date: '2026-04-11', start_time: '09:00', title: '週六訓練' }),
      makeEvent({ source_type: 'training_class', schedule_date: '2026-04-04', start_time: '09:00', title: '特訓課' })
    ])

    expect(sorted.map((event) => `${event.schedule_date}:${event.source_type}:${event.title}`)).toEqual([
      '2026-04-04:training_location:外野',
      '2026-04-04:training_class:特訓課',
      '2026-04-04:match:比賽',
      '2026-04-11:training_date:週六訓練'
    ])
  })

  it('merges matching candidates and persisted events with persisted assignment data winning', () => {
    const merged = mergeCoachScheduleEvents([
      makeEvent({
        id: null,
        is_persisted: false,
        source_type: 'training_date',
        schedule_date: '2026-04-04',
        title: '週六訓練'
      }),
      makeEvent({
        id: 'event-1',
        is_persisted: true,
        source_type: 'training_date',
        schedule_date: '2026-04-04',
        title: '週六訓練',
        coach_profile_ids: ['coach-a']
      })
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('event-1')
    expect(merged[0].coach_profile_ids).toEqual(['coach-a'])
  })

  it('normalizes month payload and drops rows without dates', () => {
    const payload = normalizeCoachScheduleMonthPayload({
      month_start: '2026-04-01',
      scope: 'all',
      events: [
        { schedule_date: '2026-04-18', title: '比賽', source_type: 'match' },
        { title: 'missing date', source_type: 'manual' }
      ]
    })

    expect(payload.month_start).toBe('2026-04-01')
    expect(payload.scope).toBe('all')
    expect(payload.events).toHaveLength(1)
    expect(payload.events[0].title).toBe('比賽')
  })
})
