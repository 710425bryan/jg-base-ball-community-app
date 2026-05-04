import { describe, expect, it } from 'vitest'
import {
  buildTrainingLocationNotificationBody,
  buildTrainingLocationNotificationEventKey,
  buildTrainingLocationNotificationTitle,
  buildTrainingLocationNotificationUrl,
  getTrainingLocationTargetDateInTaipei,
  groupTrainingLocationNotificationTargets,
  type TrainingLocationNotificationTarget
} from './trainingLocationNotification'

const buildTarget = (
  overrides: Partial<TrainingLocationNotificationTarget> = {}
): TrainingLocationNotificationTarget => ({
  user_id: 'user-1',
  session_id: 'session-1',
  session_updated_at: '2026-05-01T08:00:00.000Z',
  member_id: 'member-1',
  member_name: '王小明',
  title: '週六訓練',
  training_date: '2026-05-02',
  start_time: '09:00',
  end_time: '11:00',
  venue_name: '中港國小',
  venue_address: '新北市新莊區中港路',
  venue_maps_url: null,
  is_on_leave: false,
  ...overrides
})

describe('trainingLocationNotification', () => {
  it('calculates the target date using Asia/Taipei timezone', () => {
    expect(getTrainingLocationTargetDateInTaipei(new Date('2026-05-01T15:59:00.000Z'))).toBe('2026-05-02')
    expect(getTrainingLocationTargetDateInTaipei(new Date('2026-05-01T16:00:00.000Z'))).toBe('2026-05-03')
  })

  it('groups multiple linked players for the same user and session', () => {
    const groups = groupTrainingLocationNotificationTargets([
      buildTarget(),
      buildTarget({
        member_id: 'member-2',
        member_name: '林小安',
        venue_name: '輔大棒球場地'
      })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      userId: 'user-1',
      sessionId: 'session-1',
      assignments: [
        { memberId: 'member-1', memberName: '王小明', venueName: '中港國小' },
        { memberId: 'member-2', memberName: '林小安', venueName: '輔大棒球場地' }
      ]
    })
  })

  it('excludes players that are marked as on leave', () => {
    const groups = groupTrainingLocationNotificationTargets([
      buildTarget({ member_id: 'member-1', is_on_leave: true }),
      buildTarget({ member_id: 'member-2', member_name: '林小安' })
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0].assignments).toEqual([
      expect.objectContaining({ memberId: 'member-2' })
    ])
  })

  it('builds stable event keys, urls, title and body', () => {
    const group = groupTrainingLocationNotificationTargets([
      buildTarget(),
      buildTarget({
        member_id: 'member-2',
        member_name: '林小安',
        venue_name: '輔大棒球場地'
      })
    ])[0]

    expect(buildTrainingLocationNotificationEventKey(group))
      .toBe('training_location:session-1:user-1:2026-05-01T08:00:00.000Z')
    expect(buildTrainingLocationNotificationUrl(group)).toBe('/dashboard?training_date=2026-05-02')
    expect(buildTrainingLocationNotificationTitle(group)).toBe('訓練場地通知：2026-05-02 週六訓練')
    expect(buildTrainingLocationNotificationBody(group)).toBe([
      '日期：2026-05-02',
      '時間：09:00-11:00',
      '王小明：中港國小',
      '林小安：輔大棒球場地'
    ].join('\n'))
  })
})
