import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const matchFeeMocks = vi.hoisted(() => ({
  listMatchFeeItemsByMonth: vi.fn(),
  listMatchPaymentSubmissions: vi.fn()
}))

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

vi.mock('@/services/matchFees', () => ({
  listMatchFeeItemsByMonth: matchFeeMocks.listMatchFeeItemsByMonth,
  listMatchPaymentSubmissions: matchFeeMocks.listMatchPaymentSubmissions
}))

describe('feeManagementReminders service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('merges RPC reminders with match fee reminder items', async () => {
    rpcMock.mockResolvedValue({
      data: {
        items: [{
          id: 'monthly-pending',
          kind: 'profilePaymentPending',
          title: '月費待確認',
          body: '1 筆',
          count: 1,
          amount: 1000,
          severity: 'warning',
          link: '/fees',
          created_at: '2026-07-01T00:00:00.000Z'
        }]
      },
      error: null
    })
    matchFeeMocks.listMatchPaymentSubmissions.mockResolvedValue([
      { id: 'match-submission-1', status: 'pending_review', amount: 500, created_at: '2026-07-02T00:00:00.000Z' }
    ])
    matchFeeMocks.listMatchFeeItemsByMonth.mockResolvedValue([
      { id: 'match-item-1', payment_status: 'unpaid', amount: 300, updated_at: '2026-07-03T00:00:00.000Z' }
    ])

    const { getFeeManagementReminders } = await import('./feeManagementReminders')
    const snapshot = await getFeeManagementReminders()

    expect(snapshot.items.map((item) => item.id)).toEqual([
      'match-payment-pending',
      'monthly-pending',
      'match-fees-unpaid'
    ])
    expect(snapshot.total_count).toBe(3)
    expect(snapshot.total_amount).toBe(1800)
  })

  it('keeps RPC reminders when match fee reminder enrichment fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcMock.mockResolvedValue({
      data: {
        items: [{
          id: 'equipment-unpaid',
          kind: 'equipmentUnpaid',
          title: '裝備待追蹤',
          body: '1 筆',
          count: 1,
          amount: 200,
          severity: 'info',
          link: '/fees',
          created_at: '2026-07-01T00:00:00.000Z'
        }]
      },
      error: null
    })
    matchFeeMocks.listMatchPaymentSubmissions.mockRejectedValue(new Error('rpc unavailable'))

    const { getFeeManagementReminders } = await import('./feeManagementReminders')

    await expect(getFeeManagementReminders()).resolves.toMatchObject({
      total_count: 1,
      total_amount: 200
    })
  })
})
