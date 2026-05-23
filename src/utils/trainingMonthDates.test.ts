import { describe, expect, it } from 'vitest'
import {
  buildTrainingMonthDateItems,
  diffTrainingMonthDates,
  formatTrainingMonthDateLabel,
  formatTrainingMonthLabel,
  getDefaultTrainingMonthDates,
  normalizeTrainingMonth,
  normalizeTrainingMonthDateList
} from './trainingMonthDates'
import {
  buildTrainingDateNotificationBody,
  buildTrainingDateNotificationEventKey,
  buildTrainingDateNotificationTitle,
  buildTrainingDateNotificationUrl,
  groupTrainingDateNotificationTargets
} from './trainingDateNotification'

describe('trainingMonthDates', () => {
  it('normalizes month values and falls back to the current Taipei month', () => {
    expect(normalizeTrainingMonth('2026-05')).toBe('2026-05')
    expect(normalizeTrainingMonth('2026-05-23')).toBe('2026-05')
    expect(normalizeTrainingMonth('bad-value', '2026-06')).toBe('2026-06')
  })

  it('returns every Saturday as the default training dates for a month', () => {
    expect(getDefaultTrainingMonthDates('2026-05')).toEqual([
      '2026-05-02',
      '2026-05-09',
      '2026-05-16',
      '2026-05-23',
      '2026-05-30'
    ])
  })

  it('filters, deduplicates, and sorts training dates inside the target month', () => {
    expect(normalizeTrainingMonthDateList([
      '2026-05-23',
      'bad-date',
      '2026-06-06',
      '2026-05-02',
      '2026-05-02'
    ], '2026-05')).toEqual(['2026-05-02', '2026-05-23'])
  })

  it('diffs changed dates', () => {
    expect(diffTrainingMonthDates(
      ['2026-05-02', '2026-05-09'],
      ['2026-05-09', '2026-05-16']
    )).toEqual({
      addedDates: ['2026-05-16'],
      removedDates: ['2026-05-02']
    })
  })

  it('formats month and date labels', () => {
    expect(formatTrainingMonthLabel('2026-05')).toBe('2026 年 5 月')
    expect(formatTrainingMonthDateLabel('2026-05-02')).toBe('5/2 週六')
  })

  it('builds date items with today and past state', () => {
    expect(buildTrainingMonthDateItems(['2026-05-02', '2026-05-09'], '2026-05-09'))
      .toEqual([
        expect.objectContaining({ date: '2026-05-02', is_past: true, is_today: false }),
        expect.objectContaining({ date: '2026-05-09', is_past: false, is_today: true })
      ])
  })
})

describe('trainingDateNotification', () => {
  it('groups linked members by target user', () => {
    expect(groupTrainingDateNotificationTargets([
      { user_id: 'user-1', member_id: 'member-1', member_name: '王小明' },
      { user_id: 'user-1', member_id: 'member-2', member_name: '林小安' },
      { user_id: 'user-2', member_id: 'member-3', member_name: '陳小白' }
    ])).toEqual([
      {
        userId: 'user-1',
        memberIds: ['member-1', 'member-2'],
        memberNames: ['王小明', '林小安']
      },
      {
        userId: 'user-2',
        memberIds: ['member-3'],
        memberNames: ['陳小白']
      }
    ])
  })

  it('builds stable notification payload text', () => {
    const context = {
      monthStart: '2026-05-01',
      trainingDates: ['2026-05-02', '2026-05-16'],
      addedDates: ['2026-05-16'],
      removedDates: ['2026-05-09'],
      changeKey: '2026-05-01T08:00:00.000Z'
    }
    const group = { userId: 'user-1' }

    expect(buildTrainingDateNotificationEventKey(group, context))
      .toBe('training_dates:2026-05-01:user-1:2026-05-01T08:00:00.000Z')
    expect(buildTrainingDateNotificationUrl(context)).toBe('/dashboard?training_month=2026-05')
    expect(buildTrainingDateNotificationTitle(context)).toBe('訓練日期異動：2026 年 5 月')
    expect(buildTrainingDateNotificationBody(context)).toBe([
      '本月訓練日：5/2 週六、5/16 週六',
      '新增：5/16 週六',
      '取消：5/9 週六'
    ].join('\n'))
  })
})
