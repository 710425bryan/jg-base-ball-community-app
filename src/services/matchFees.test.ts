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
        match_fee_amount: '300',
        payment_opened_at: '2026-07-05T08:00:00Z',
        payment_opened_by_name: '管理員',
        has_payment_history: true,
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
        match_fee_amount: 300,
        payment_opened_at: '2026-07-05T08:00:00Z',
        payment_opened_by_name: '管理員',
        has_payment_history: true,
        balance_amount: 50,
        match_id: null
      })
    ])
    expect(rpcMock).toHaveBeenCalledWith('list_my_match_fee_items', {
      p_member_id: 'member-1'
    })
  })

  it('opens or closes a match fee group through the protected RPC', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        match_id: 'match-1',
        is_payment_open: true,
        payment_opened_at: '2026-07-05T08:00:00Z',
        payable_item_count: '2',
        payable_amount: '600'
      }],
      error: null
    })

    const { setMatchFeePaymentOpenState } = await import('./matchFees')

    await expect(setMatchFeePaymentOpenState('match-1', true)).resolves.toEqual({
      match_id: 'match-1',
      is_payment_open: true,
      payment_opened_at: '2026-07-05T08:00:00Z',
      payable_item_count: 2,
      payable_amount: 600
    })
    expect(rpcMock).toHaveBeenCalledWith('set_match_fee_payment_open_state', {
      p_match_id: 'match-1',
      p_is_open: true
    })
  })

  it('deletes a safe cancelled group through the protected RPC', async () => {
    rpcMock.mockResolvedValue({ data: 3, error: null })

    const { deleteCancelledMatchFeeGroup } = await import('./matchFees')

    await expect(deleteCancelledMatchFeeGroup('item-1')).resolves.toBe(3)
    expect(rpcMock).toHaveBeenCalledWith('delete_cancelled_match_fee_group', {
      p_match_fee_item_id: 'item-1'
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

  it('normalizes exemption flags and sends the version to the protected RPC', async () => {
    const { listMatchFeeItemsByMonth, setMatchFeeItemExemption } = await import('./matchFees')
    rpcMock.mockResolvedValue({ data: [{ is_exempt: true }, {}], error: null })
    expect((await listMatchFeeItemsByMonth('2026-09')).map(i => i.is_exempt)).toEqual([true, false])
    rpcMock.mockResolvedValue({ data: null, error: null })
    await setMatchFeeItemExemption('fee-1', true, '2026-09-27T00:00:00Z')
    expect(rpcMock).toHaveBeenLastCalledWith('set_match_fee_item_exemption', {
      p_match_fee_item_id: 'fee-1', p_is_exempt: true, p_expected_updated_at: '2026-09-27T00:00:00Z'
    })
    rpcMock.mockResolvedValue({ data: null, error: { message: '已更新', code: 'P0002' } })
    await expect(setMatchFeeItemExemption('fee-1', false, 'old')).rejects.toMatchObject({ code: 'P0002' })
  })
})
