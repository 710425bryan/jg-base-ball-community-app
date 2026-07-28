import { describe, expect, it } from 'vitest'
import {
  buildMatchFeePaymentNotificationBody,
  buildMatchFeePaymentNotificationEventKey,
  describeMatchFeePaymentNotificationResult,
  groupMatchFeePaymentNotificationTargets
} from './matchFeePaymentNotifications'

describe('matchFeePaymentNotifications', () => {
  it('groups only linked fee items per active target profile', () => {
    const groups = groupMatchFeePaymentNotificationTargets({
      id: 'match-1',
      match_name: '測試盃',
      match_date: '2026-07-20',
      payment_opened_at: '2026-07-01T00:00:00Z'
    }, [
      { id: 'item-1', member_id: 'member-1', member_name: '王小明', amount: 100 },
      { id: 'item-2', member_id: 'member-2', member_name: '李小華', amount: 100 },
      { id: 'item-2', member_id: 'member-2', member_name: '李小華', amount: 100 }
    ], [
      { id: 'user-1', linked_team_member_ids: ['member-1', 'member-2'] },
      { id: 'user-2', linked_team_member_ids: ['member-3'] }
    ])

    expect(groups).toEqual([expect.objectContaining({
      user_id: 'user-1',
      item_ids: ['item-1', 'item-2'],
      member_ids: ['member-1', 'member-2'],
      member_names: ['王小明', '李小華'],
      total_amount: 200,
      title: '比賽費用已開放付款',
      body: '王小明、李小華 的「測試盃」（2026-07-20）比賽費用已開放，合計 $200。請至繳費資訊查看並完成付款。',
      url: '/my-payments'
    })])
  })

  it('builds a stable per-opening per-user event key', () => {
    expect(buildMatchFeePaymentNotificationEventKey({
      matchId: 'match-1',
      paymentOpenedAt: '2026-07-01T08:00:00+08:00',
      userId: 'user-1'
    })).toBe('match_fee_payment_opened:match-1:2026-07-01T00:00:00.000Z:user-1')
  })

  it('uses a safe fallback when match and member labels are missing', () => {
    expect(buildMatchFeePaymentNotificationBody({
      matchName: '',
      matchDate: null,
      memberNames: [],
      totalAmount: 100
    })).toBe('相關球員 的「比賽」比賽費用已開放，合計 $100。請至繳費資訊查看並完成付款。')
  })

  it('describes station-only, fully delivered, and duplicate results', () => {
    expect(describeMatchFeePaymentNotificationResult({
      target_user_count: 1,
      created_count: 1,
      subscription_count: 0
    })).toEqual(expect.objectContaining({
      type: 'warning',
      message: expect.stringContaining('已建立站內通知')
    }))

    expect(describeMatchFeePaymentNotificationResult({
      target_user_count: 1,
      created_count: 1,
      subscription_count: 1,
      dispatched_count: 1,
      failed_count: 0
    })).toEqual({
      type: 'success',
      message: '已發送站內通知與瀏覽器通知。'
    })

    expect(describeMatchFeePaymentNotificationResult({
      target_user_count: 1,
      created_count: 0,
      duplicate_count: 1
    }).message).toContain('略過重複發送')
  })
})
