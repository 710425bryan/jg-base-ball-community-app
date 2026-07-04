import { describe, expect, it } from 'vitest'
import {
  buildTrainingDateNotificationBody,
  buildTrainingDateNotificationEventKey,
  buildTrainingDateNotificationTitle,
  buildTrainingDateNotificationUrl,
  groupTrainingDateNotificationTargets
} from './trainingDateNotification'

describe('trainingDateNotification', () => {
  it('groups target members by user and deduplicates member ids', () => {
    const groups = groupTrainingDateNotificationTargets([
      { user_id: 'user-1', member_id: 'member-2', member_name: '小乙' },
      { user_id: 'user-1', member_id: 'member-1', member_name: '小甲' },
      { user_id: 'user-1', member_id: 'member-1', member_name: '小甲重複' },
      { user_id: '', member_id: 'member-3', member_name: '忽略' }
    ])

    expect(groups).toEqual([
      {
        userId: 'user-1',
        memberIds: ['member-2', 'member-1'],
        memberNames: ['小乙', '小甲']
      }
    ])
  })

  it('builds stable event key and dashboard url', () => {
    expect(buildTrainingDateNotificationEventKey(
      { userId: 'user-1' },
      { monthStart: '2026-07-01', programKey: 'junior-high', changeKey: 'changed-at' }
    )).toBe('training_dates:junior-high:2026-07-01:user-1:changed-at')

    expect(buildTrainingDateNotificationUrl({
      monthStart: '2026-07-01',
      programKey: 'junior high'
    })).toBe('/dashboard?training_month=2026-07&training_program=junior%20high')
  })

  it('builds title and body with normalized month dates', () => {
    const title = buildTrainingDateNotificationTitle({
      monthStart: '2026-07-01',
      programLabel: '國中校隊'
    })
    const body = buildTrainingDateNotificationBody({
      monthStart: '2026-07-01',
      programLabel: '國中校隊',
      trainingDates: ['2026-07-11', 'invalid', '2026-07-04', '2026-08-01'],
      addedDates: ['2026-07-18'],
      removedDates: ['2026-07-25'],
      changeKey: 'updated'
    })

    expect(title).toBe('國中校隊 訓練日期異動：2026 年 7 月')
    expect(body).toBe([
      '本月訓練日：7/4 週六、7/11 週六',
      '新增：7/18 週六',
      '取消：7/25 週六'
    ].join('\n'))
  })

  it('falls back when no training dates are configured', () => {
    expect(buildTrainingDateNotificationBody({
      monthStart: '2026-07-01',
      trainingDates: [],
      changeKey: 'empty'
    })).toBe('本月訓練日：尚未設定')
  })
})
