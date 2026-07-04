import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSupabaseRpcAvailabilityCache } from '@/utils/supabaseRpc'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn()
    },
    from: vi.fn(),
    rpc: rpcMock,
    storage: {
      from: vi.fn()
    }
  }
}))

describe('equipmentApi payment helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseRpcAvailabilityCache()
  })

  it('lists and normalizes my equipment payment items', async () => {
    rpcMock.mockResolvedValue({
      data: [{ transaction_id: 'tx-1', quantity: '2', unit_price: '300', total_amount: '600' }],
      error: null
    })

    const { listMyEquipmentPaymentItems } = await import('./equipmentApi')

    expect(await listMyEquipmentPaymentItems('member-1')).toEqual([
      expect.objectContaining({
        transaction_id: 'tx-1',
        quantity: 2,
        unit_price: 300,
        total_amount: 600
      })
    ])
    expect(rpcMock).toHaveBeenCalledWith('list_my_equipment_payment_items', {
      p_member_id: 'member-1'
    })
  })

  it('creates and reviews equipment payment submissions with nullable optional fields', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ id: 'submission-1', amount: '600', balance_amount: '100', external_amount: '500', items: [] }],
        error: null
      })
      .mockResolvedValueOnce({
        data: [{ id: 'submission-1', amount: '600', status: 'approved', items: [] }],
        error: null
      })

    const {
      createEquipmentPaymentSubmission,
      reviewEquipmentPaymentSubmission
    } = await import('./equipmentApi')

    expect(await createEquipmentPaymentSubmission({
      transaction_ids: ['tx-1'],
      payment_method: '銀行轉帳',
      account_last_5: '',
      remittance_date: '2026-07-05',
      note: '',
      balance_amount: undefined
    })).toMatchObject({
      id: 'submission-1',
      amount: 600,
      balance_amount: 100,
      external_amount: 500
    })
    await reviewEquipmentPaymentSubmission('submission-1', 'approved', 20)

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'create_equipment_payment_submission', {
      p_transaction_ids: ['tx-1'],
      p_payment_method: '銀行轉帳',
      p_account_last_5: null,
      p_remittance_date: '2026-07-05',
      p_note: null,
      p_balance_amount: 0
    })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'review_equipment_payment_submission', {
      p_submission_id: 'submission-1',
      p_status: 'approved',
      p_overpayment_amount: 20
    })
  })

  it('marks equipment transactions paid through the RPC', async () => {
    rpcMock.mockResolvedValue({ data: '2', error: null })

    const { markEquipmentTransactionsPaid } = await import('./equipmentApi')

    await expect(markEquipmentTransactionsPaid(['tx-1', 'tx-2'])).resolves.toBe(2)
    expect(rpcMock).toHaveBeenCalledWith('mark_equipment_transactions_paid', {
      p_transaction_ids: ['tx-1', 'tx-2']
    })
  })
})
