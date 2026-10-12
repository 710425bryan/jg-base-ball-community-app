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

  it('reads authoritative cancellation fields for every fee status without changing amounts or payment states', async () => {
    rpcMock.mockResolvedValue({ data: ['cancelled', 'pending_review', 'paid'].map((payment_status, index) => ({
      id: `fee-${index}`, payment_status, amount: '500', match_cancelled_at: '2026-10-12T08:00:00Z',
      match_cancellation_reason: '球場積水', cancelled_reason: payment_status === 'cancelled' ? '比賽已取消：球場積水' : null
    })), error: null })
    const { listMatchFeeItemsByMonth } = await import('./matchFees')
    const rows = await listMatchFeeItemsByMonth('2026-10')
    expect(rpcMock).toHaveBeenCalledWith('list_match_fee_items_by_month_with_match_status', { p_fee_month: '2026-10' })
    expect(rows.map(row => [row.payment_status, row.amount, row.match_cancelled_at, row.match_cancellation_reason]))
      .toEqual(['cancelled', 'pending_review', 'paid'].map(status => [status, 500, '2026-10-12T08:00:00Z', '球場積水']))
  })

  it.each(['PGRST202', '42883'])('falls back to the original list only when the status RPC is unavailable (%s)', async code => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code, message: 'function public.list_match_fee_items_by_month_with_match_status(text) does not exist' } })
      .mockResolvedValueOnce({ data: [{ id: 'legacy', amount: 300, payment_status: 'cancelled', is_exempt: true, cancelled_reason: '單場免繳' }], error: null })
    const { listMatchFeeItemsByMonth } = await import('./matchFees')
    expect(await listMatchFeeItemsByMonth('2026-10')).toEqual([expect.objectContaining({
      id: 'legacy', amount: 300, payment_status: 'cancelled', is_exempt: true,
      match_cancelled_at: null, match_cancellation_reason: null
    })])
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'list_match_fee_items_by_month', { p_fee_month: '2026-10' })
  })

  it('never infers match cancellation from an exemption or a historical fee reason', async () => {
    rpcMock.mockResolvedValue({ data: [
      { is_exempt: true, payment_status: 'cancelled', cancelled_reason: '單場免繳' },
      { payment_status: 'cancelled', cancelled_reason: '比賽已取消：舊原因', match_cancelled_at: null, match_cancellation_reason: null }
    ], error: null })
    const { listMatchFeeItemsByMonth } = await import('./matchFees')
    expect((await listMatchFeeItemsByMonth('2026-10')).map(row => [row.match_cancelled_at, row.match_cancellation_reason]))
      .toEqual([[null, null], [null, null]])
  })

  it.each([
    { code: '42501', message: 'fees VIEW permission required' },
    { code: '57014', message: 'statement timeout' },
    { code: '42883', message: 'function internal_billing_helper() does not exist' }
  ])('does not hide $code failures with a legacy fallback', async error => {
    rpcMock.mockResolvedValue({ data: null, error })
    const { listMatchFeeItemsByMonth } = await import('./matchFees')
    await expect(listMatchFeeItemsByMonth('2026-10')).rejects.toBe(error)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('propagates legacy fallback failures', async () => {
    const denied = { code: '42501', message: 'denied' }
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
      .mockResolvedValueOnce({ data: null, error: denied })
    const { listMatchFeeItemsByMonth } = await import('./matchFees')
    await expect(listMatchFeeItemsByMonth('2026-10')).rejects.toBe(denied)
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
