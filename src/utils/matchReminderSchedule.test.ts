import { describe, expect, it } from 'vitest'
import {
  buildMatchReminderScheduleEventKey,
  createDefaultMatchReminderScheduleConfig,
  getDateTimeInTaipei,
  getDueMatchReminderRules,
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
})
