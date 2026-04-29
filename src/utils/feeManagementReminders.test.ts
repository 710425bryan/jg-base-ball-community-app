import { describe, expect, it } from 'vitest'
import {
  normalizeFeeManagementReminderItem,
  normalizeFeeManagementReminderSnapshot
} from './feeManagementReminders'

describe('fee management reminder mapping', () => {
  it('normalizes a valid RPC reminder item', () => {
    expect(normalizeFeeManagementReminderItem({
      id: 'profile-payment-pending',
      kind: 'profilePaymentPending',
      title: '個人付款待確認',
      body: '2 筆個人付款回報等待確認。',
      count: '2',
      amount: '3500',
      severity: 'urgent',
      link: '/fees?highlight_submission_id=submission-1',
      created_at: '2026-04-29T08:00:00.000Z'
    })).toEqual({
      id: 'profile-payment-pending',
      kind: 'profilePaymentPending',
      title: '個人付款待確認',
      body: '2 筆個人付款回報等待確認。',
      count: 2,
      amount: 3500,
      severity: 'urgent',
      link: '/fees?highlight_submission_id=submission-1',
      created_at: '2026-04-29T08:00:00.000Z'
    })
  })

  it('drops unknown kinds and zero-count reminders', () => {
    const snapshot = normalizeFeeManagementReminderSnapshot({
      items: [
        { kind: 'profilePaymentPending', count: 0 },
        { kind: 'unknownReminder', count: 3 },
        {
          id: 'equipment-payment-pending',
          kind: 'equipmentPaymentPending',
          title: '裝備付款待確認',
          body: '1 筆待確認。',
          count: 1,
          amount: 1200,
          severity: 'urgent',
          link: '/fees?tab=equipment'
        }
      ]
    })

    expect(snapshot.items).toHaveLength(1)
    expect(snapshot.items[0]).toMatchObject({
      id: 'equipment-payment-pending',
      kind: 'equipmentPaymentPending',
      count: 1,
      amount: 1200
    })
    expect(snapshot.total_count).toBe(1)
    expect(snapshot.total_amount).toBe(1200)
  })

  it('keeps period metadata and falls back to item totals', () => {
    const snapshot = normalizeFeeManagementReminderSnapshot({
      generated_at: '2026-04-29T09:00:00.000Z',
      monthly_period: '2026-04',
      quarterly_period: '2026-Q2',
      items: [
        {
          kind: 'monthlyUnpaid',
          title: '校隊月費待追蹤',
          body: '3 位校隊成員尚未標記已繳。',
          count: 3,
          amount: 0,
          severity: 'warning',
          link: '/fees?tab=monthly',
          created_at: '2026-04-29T09:00:00.000Z'
        },
        {
          kind: 'quarterlyUnpaid',
          title: '球員季費待追蹤',
          body: '2 位球員尚未標記已繳。',
          count: 2,
          amount: 6000,
          severity: 'warning',
          link: '/fees?tab=quarterly',
          created_at: '2026-04-29T09:00:00.000Z'
        }
      ]
    })

    expect(snapshot.total_count).toBe(5)
    expect(snapshot.total_amount).toBe(6000)
    expect(snapshot.monthly_period).toBe('2026-04')
    expect(snapshot.quarterly_period).toBe('2026-Q2')
  })
})
