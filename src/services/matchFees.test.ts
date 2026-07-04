import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('matchFees service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists and normalizes match fee items', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: 'item-1',
        amount: '300',
        balance_amount: '50',
        match_id: null,
        tournament_name: null,
        match_time: null,
        category_group: null,
        payment_submission_id: null,
        payment_submission_status: null,
        paid_at: null,
        cancelled_reason: null
      }],
      error: null
    })

    const { listMyMatchFeeItems } = await import('./matchFees')

    expect(await listMyMatchFeeItems('member-1')).toEqual([
      expect.objectContaining({
        id: 'item-1',
        amount: 300,
        balance_amount: 50,
        match_id: null
      })
    ])
    expect(rpcMock).toHaveBeenCalledWith('list_my_match_fee_items', {
      p_member_id: 'member-1'
    })
  })

  it('creates and reviews match payment submissions with normalized items', async () => {
    const row = {
      id: 'submission-1',
      amount: '600',
      balance_amount: '100',
      external_amount: '500',
      account_last_5: undefined,
      note: undefined,
      reviewed_at: undefined,
      reviewed_by: undefined,
      items: [{ id: 'item-1', amount: '600', balance_amount: '100' }]
    }
    rpcMock
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: { ...row, status: 'approved' }, error: null })

    const { createMatchPaymentSubmission, reviewMatchPaymentSubmission } = await import('./matchFees')

    expect(await createMatchPaymentSubmission({
      match_fee_item_ids: ['item-1'],
      payment_method: '銀行轉帳',
      account_last_5: '',
      remittance_date: '2026-07-05',
      note: '',
      balance_amount: 100
    })).toMatchObject({
      id: 'submission-1',
      amount: 600,
      balance_amount: 100,
      external_amount: 500,
      account_last_5: null,
      note: null,
      items: [expect.objectContaining({ amount: 600 })]
    })

    await reviewMatchPaymentSubmission('submission-1', 'approved', 20)
    expect(rpcMock).toHaveBeenLastCalledWith('review_match_payment_submission', {
      p_submission_id: 'submission-1',
      p_status: 'approved',
      p_overpayment_amount: 20
    })
  })
})
