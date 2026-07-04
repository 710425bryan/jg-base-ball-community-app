import { describe, expect, it } from 'vitest'
import {
  buildMatchReminderHealthEventKey,
  buildMatchReminderScheduleEventKey,
  createDefaultMatchReminderScheduleConfig,
  findMissingMatchReminderEvents,
  getDateTimeInTaipei,
  getDueMatchReminderRules,
  getRecentDueMatchReminderRules,
  normalizeMatchReminderScheduleConfig,
  validateMatchReminderScheduleConfig
} from './matchReminderSchedule'

describe('matchReminderSchedule', () => {
  it('normalizes missing config to the current default schedule', () => {
    expect(normalizeMatchReminderScheduleConfig(null)).toEqual(createDefaultMatchReminderScheduleConfig())
  })

  it('deduplicates repeated days and time combinations', () => {
    const config = normalizeMatchReminderScheduleConfig({
      version: 1,
      enabled: true,
      rules: [
        { id: 'first', days_before: 1, time: '20:00', enabled: true },
        { id: 'second', days_before: 1, time: '20:00', enabled: true },
        { id: 'third', days_before: 3, time: '20:00', enabled: false }
      ]
    })

    expect(config.rules).toEqual([
      { id: 'first', days_before: 1, time: '20:00', enabled: true },
      { id: 'third', days_before: 3, time: '20:00', enabled: false }
    ])
  })

  it('validates rule boundaries and duplicate rules', () => {
    const errors = validateMatchReminderScheduleConfig({
      version: 1,
      enabled: true,
      rules: [
        { id: 'invalid-days', days_before: 31, time: '20:00', enabled: true },
        { id: 'invalid-time', days_before: 1, time: '24:00', enabled: true },
        { id: 'duplicate-a', days_before: 3, time: '19:30', enabled: true },
        { id: 'duplicate-b', days_before: 3, time: '19:30', enabled: false }
      ]
    })

    expect(errors).toContain('第 1 組提醒的賽前天數需介於 0 到 30 天')
    expect(errors).toContain('第 2 組提醒時間需為 HH:mm 格式')
    expect(errors).toContain('第 4 組提醒與其他規則重複')
  })

  it('caps normalized rules at ten rows', () => {
    const config = normalizeMatchReminderScheduleConfig({
      version: 1,
      enabled: true,
      rules: Array.from({ length: 12 }, (_, index) => ({
        id: `rule-${index}`,
        days_before: index,
        time: '20:00',
        enabled: true
      }))
    })

    expect(config.rules).toHaveLength(10)
  })

  it('detects due rules using Asia/Taipei date and minute', () => {
    const rules = getDueMatchReminderRules({
      version: 1,
      enabled: true,
      rules: [
        { id: 'three-days', days_before: 3, time: '20:00', enabled: true },
        { id: 'disabled', days_before: 1, time: '20:00', enabled: false },
        { id: 'not-now', days_before: 1, time: '20:15', enabled: true }
      ]
    }, new Date('2026-06-14T12:00:30.000Z'))

    expect(getDateTimeInTaipei(new Date('2026-06-14T12:00:30.000Z'))).toEqual({
      date: '2026-06-14',
      time: '20:00'
    })
    expect(rules).toEqual([
      {
        id: 'three-days',
        days_before: 3,
        time: '20:00',
        enabled: true,
        scheduled_date: '2026-06-14',
        target_date: '2026-06-17'
      }
    ])
  })

  it('builds a stable scheduled reminder event key per rule and scheduled minute', () => {
    expect(buildMatchReminderScheduleEventKey(
      { id: 'match-1' },
      {
        id: 'three-days',
        time: '20:00',
        scheduled_date: '2026-06-14'
      }
    )).toBe('match_reminder:match-1:three-days:2026-06-14:20:00')
  })

  it('detects recent due rules after the grace period', () => {
    const config = {
      version: 1,
      enabled: true,
      rules: [
        { id: 'one-day', days_before: 1, time: '20:00', enabled: true },
        { id: 'not-yet', days_before: 1, time: '20:05', enabled: true }
      ]
    }

    expect(getRecentDueMatchReminderRules(config, new Date('2026-07-04T12:05:00.000Z'))).toEqual([
      {
        id: 'one-day',
        days_before: 1,
        time: '20:00',
        enabled: true,
        scheduled_date: '2026-07-04',
        target_date: '2026-07-05'
      }
    ])
  })

  it('does not check reminder rules that are still inside the grace period', () => {
    const config = {
      version: 1,
      enabled: true,
      rules: [
        { id: 'one-day', days_before: 1, time: '20:00', enabled: true }
      ]
    }

    expect(getRecentDueMatchReminderRules(config, new Date('2026-07-04T12:02:00.000Z'))).toEqual([])
  })

  it('finds missing reminder events only when target matches exist', () => {
    const rule = {
      id: 'one-day',
      days_before: 1,
      time: '20:00',
      enabled: true,
      scheduled_date: '2026-07-04',
      target_date: '2026-07-05'
    }

    expect(findMissingMatchReminderEvents([rule], {}, [])).toEqual([])

    expect(findMissingMatchReminderEvents([rule], {
      '2026-07-05': [
        {
          id: 'match-1',
          match_date: '2026-07-05',
          match_time: '09:00 - 11:00',
          match_name: '投捕特訓課'
        }
      ]
    }, [])).toEqual([
      {
        rule,
        target_date: '2026-07-05',
        missing_matches: [
          {
            id: 'match-1',
            match_date: '2026-07-05',
            match_time: '09:00 - 11:00',
            match_name: '投捕特訓課'
          }
        ],
        missing_count: 1,
        expected_event_keys: ['match_reminder:match-1:one-day:2026-07-04:20:00'],
        missing_event_keys: ['match_reminder:match-1:one-day:2026-07-04:20:00']
      }
    ])
  })

  it('does not report matches that already have scheduled reminder events', () => {
    const rule = {
      id: 'one-day',
      days_before: 1,
      time: '20:00',
      enabled: true,
      scheduled_date: '2026-07-04',
      target_date: '2026-07-05'
    }
    const existingKey = 'match_reminder:match-1:one-day:2026-07-04:20:00'

    expect(findMissingMatchReminderEvents([rule], {
      '2026-07-05': [
        {
          id: 'match-1',
          match_date: '2026-07-05',
          match_time: '09:00 - 11:00',
          match_name: '投捕特訓課'
        }
      ]
    }, [existingKey])).toEqual([])
  })

  it('builds stable per-admin health alert event keys', () => {
    expect(buildMatchReminderHealthEventKey(
      'missing_events',
      {
        id: 'one-day',
        scheduled_date: '2026-07-04',
        time: '20:00'
      },
      'admin-1'
    )).toBe('match_reminder_health:missing_events:one-day:2026-07-04:20:00:admin-1')
  })
})
