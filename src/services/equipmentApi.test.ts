import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSupabaseRpcAvailabilityCache } from '@/utils/supabaseRpc'

const rpcMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn()
    },
    from: fromMock,
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

  it('passes a signed stock-out delta through the existing inventory adjustment RPC', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'adjustment-1',
        equipment_id: 'equipment-1',
        adjustment_type: 'stock_out',
        quantity_delta: 2,
        total_quantity_after: 8,
        sizes_stock_after: [{ size: 'M', quantity: 3 }]
      },
      error: null
    })

    const { createEquipmentInventoryAdjustment } = await import('./equipmentApi')
    const result = await createEquipmentInventoryAdjustment({
      equipment_id: 'equipment-1',
      adjustment_date: '2026-07-23',
      size: 'M',
      quantity_delta: -2,
      notes: '盤點短少'
    })

    expect(rpcMock).toHaveBeenCalledWith('create_equipment_inventory_adjustment', {
      p_equipment_id: 'equipment-1',
      p_adjustment_date: '2026-07-23',
      p_member_id: null,
      p_handled_by: null,
      p_size: 'M',
      p_quantity_delta: -2,
      p_notes: '盤點短少'
    })
    expect(result).toMatchObject({
      adjustment_type: 'stock_out',
      quantity_delta: 2,
      total_quantity_after: 8
    })
  })

  it('derives the table fallback fulfillment status from the linked request item', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function list_equipment_unpaid_payment_items'
      }
    })

    const query: any = {}
    query.select = vi.fn(() => query)
    query.eq = vi.fn(() => query)
    query.or = vi.fn(() => query)
    query.order = vi.fn().mockResolvedValue({
      data: [{
        id: 'tx-1',
        equipment_id: 'equipment-1',
        member_id: 'member-1',
        request_item_id: 'item-1',
        size: 'M',
        jersey_number: null,
        quantity: 1,
        unit_price: 500,
        payment_status: 'unpaid',
        payment_submission_id: null,
        transaction_date: '2026-07-20',
        equipment: { id: 'equipment-1', name: '中華隊應援帽', purchase_price: 500 },
        member: { id: 'member-1', name: '陳柏叡' },
        request_item: {
          id: 'item-1',
          ready_at: '2026-07-20T01:56:45.000Z',
          picked_up_at: '2026-07-20T01:56:55.000Z',
          request: { id: 'request-1', status: 'approved', picked_up_at: null }
        }
      }],
      error: null
    })
    fromMock.mockReturnValue(query)

    const { listEquipmentUnpaidPaymentItems } = await import('./equipmentApi')

    await expect(listEquipmentUnpaidPaymentItems()).resolves.toEqual([
      expect.objectContaining({
        transaction_id: 'tx-1',
        request_status: 'picked_up',
        picked_up_at: '2026-07-20T01:56:55.000Z'
      })
    ])
    expect(query.select.mock.calls[0][0]).toContain('ready_at')
    expect(query.select.mock.calls[0][0]).toContain('picked_up_at')
  })

  const mockRequestReload = () => {
    const requestQuery: any = {}
    requestQuery.select = vi.fn(() => requestQuery)
    requestQuery.eq = vi.fn(() => requestQuery)
    requestQuery.single = vi.fn().mockResolvedValue({
      data: {
        id: 'request-1',
        member_id: '',
        requester_user_id: '',
        ready_image_urls: [],
        pickup_image_urls: []
      },
      error: null
    })

    const itemsQuery: any = {}
    itemsQuery.select = vi.fn(() => itemsQuery)
    itemsQuery.in = vi.fn(() => itemsQuery)
    itemsQuery.order = vi.fn().mockResolvedValue({ data: [], error: null })

    fromMock.mockImplementation((table: string) => (
      table === 'equipment_purchase_requests' ? requestQuery : itemsQuery
    ))
  }

  it('deletes a whole purchase request through one atomic RPC', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })

    const { deleteEquipmentPurchaseRequestWithRollback } = await import('./equipmentApi')

    await expect(deleteEquipmentPurchaseRequestWithRollback('request-1')).resolves.toBeUndefined()
    expect(rpcMock).toHaveBeenCalledWith('delete_equipment_purchase_request', {
      p_request_id: 'request-1'
    })
  })

  it('uses batch fulfillment RPCs for the retained whole-request actions', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    mockRequestReload()

    const {
      markEquipmentRequestPickedUp,
      markEquipmentRequestReady
    } = await import('./equipmentApi')

    await markEquipmentRequestReady('request-1', 'user-1', '整單備貨', [])
    await markEquipmentRequestPickedUp('request-1', 'user-1', '整單領取', [], false)

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'mark_equipment_request_ready', {
      p_request_id: 'request-1',
      p_user_id: 'user-1',
      p_note: '整單備貨',
      p_image_urls: []
    })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'mark_equipment_request_picked_up', {
      p_request_id: 'request-1',
      p_user_id: 'user-1',
      p_note: '整單領取',
      p_image_urls: [],
      p_mark_paid: false
    })
  })
})
