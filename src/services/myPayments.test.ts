import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const inMock = vi.fn()
const selectMock = vi.fn(() => ({ in: inMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock
  }
}))

describe('myPayments service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters payment members through active roster metadata', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          member_id: 'member-1',
          name: '小明',
          training_program: 'junior_high_school_team',
          training_program_label: '新泰總部'
        },
        { member_id: 'member-2', name: '小華' }
      ],
      error: null
    })
    inMock.mockResolvedValue({
      data: [
        { id: 'member-1', status: '在隊', is_inactive_or_graduated: false },
        { id: 'member-2', status: '退隊', is_inactive_or_graduated: false }
      ],
      error: null
    })

    const { listMyPaymentMembers } = await import('./myPayments')

    await expect(listMyPaymentMembers()).resolves.toEqual([
      {
        member_id: 'member-1',
        name: '小明',
        training_program: 'junior_high_school_team',
        training_program_label: '新泰總部'
      }
    ])
  })

  it('normalizes submissions and nested items', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        id: 'submission-1',
        amount: '1000',
        balance_amount: '200',
        external_amount: '800',
        account_last_5: undefined,
        note: undefined,
        items: [{ member_id: 'member-1', amount: '1000', balance_amount: '200', external_amount: '800' }]
      }],
      error: null
    })

    const { listMyPaymentSubmissions } = await import('./myPayments')

    expect(await listMyPaymentSubmissions(null)).toEqual([
      expect.objectContaining({
        id: 'submission-1',
        amount: 1000,
        balance_amount: 200,
        external_amount: 800,
        account_last_5: null,
        note: null,
        items: [expect.objectContaining({ amount: 1000 })]
      })
    ])
  })

  it('sends create and review RPC payloads with nullable optional fields', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: [{ id: 'submission-1', amount: 1000 }], error: null })
      .mockResolvedValueOnce({ data: { id: 'submission-1', status: 'approved' }, error: null })

    const { createMyPaymentSubmission, reviewMyPaymentSubmission } = await import('./myPayments')

    await createMyPaymentSubmission({
      member_id: 'member-1',
      period_key: '2026-07',
      amount: 1000,
      payment_method: '銀行轉帳',
      account_last_5: '',
      remittance_date: '2026-07-05',
      note: '',
      balance_amount: undefined
    })
    await reviewMyPaymentSubmission('submission-1', 'approved', 50)

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'create_my_payment_submission', {
      p_member_id: 'member-1',
      p_period_key: '2026-07',
      p_amount: 1000,
      p_payment_method: '銀行轉帳',
      p_account_last_5: null,
      p_remittance_date: '2026-07-05',
      p_note: null,
      p_balance_amount: 0
    })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'review_profile_payment_submission', {
      p_submission_id: 'submission-1',
      p_status: 'approved',
      p_overpayment_amount: 50
    })
  })
})
