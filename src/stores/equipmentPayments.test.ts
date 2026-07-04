import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMocks = vi.hoisted(() => ({
  createEquipmentPaymentSubmission: vi.fn(),
  listEquipmentRefundableDirectPaymentItems: vi.fn(),
  listEquipmentUnpaidPaymentItems: vi.fn(),
  listEquipmentPaymentSubmissions: vi.fn(),
  listMyEquipmentPaymentItems: vi.fn(),
  listMyEquipmentPendingRequestPaymentItems: vi.fn(),
  markEquipmentTransactionsPaid: vi.fn(),
  refundEquipmentPaymentSubmission: vi.fn(),
  refundEquipmentTransactions: vi.fn(),
  reviewEquipmentPaymentSubmission: vi.fn()
}))

vi.mock('@/services/equipmentApi', () => apiMocks)

describe('equipment payments store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('loads personal payment and pending request items together', async () => {
    apiMocks.listMyEquipmentPaymentItems.mockResolvedValue([{ transaction_id: 'tx-1' }])
    apiMocks.listMyEquipmentPendingRequestPaymentItems.mockResolvedValue([{ request_id: 'request-1' }])

    const { useEquipmentPaymentsStore } = await import('./equipmentPayments')
    const store = useEquipmentPaymentsStore()

    await expect(store.loadMyItems('member-1')).resolves.toEqual([{ transaction_id: 'tx-1' }])
    expect(store.myPendingRequestItems).toEqual([{ request_id: 'request-1' }])
    expect(apiMocks.listMyEquipmentPaymentItems).toHaveBeenCalledWith('member-1')
    expect(apiMocks.listMyEquipmentPendingRequestPaymentItems).toHaveBeenCalledWith('member-1')
  })

  it('submits payments then reloads personal items', async () => {
    apiMocks.createEquipmentPaymentSubmission.mockResolvedValue({ id: 'submission-1' })
    apiMocks.listMyEquipmentPaymentItems
      .mockResolvedValueOnce([{ transaction_id: 'tx-1', payment_status: 'unpaid' }])
      .mockResolvedValueOnce([{ transaction_id: 'tx-1', payment_status: 'pending_review' }])
    apiMocks.listMyEquipmentPendingRequestPaymentItems.mockResolvedValue([])

    const { useEquipmentPaymentsStore } = await import('./equipmentPayments')
    const store = useEquipmentPaymentsStore()

    await store.loadMyItems('member-1')
    await expect(store.submitPayment({ transaction_ids: ['tx-1'] } as any, 'member-1')).resolves.toEqual({
      id: 'submission-1'
    })

    expect(apiMocks.createEquipmentPaymentSubmission).toHaveBeenCalledWith({ transaction_ids: ['tx-1'] })
    expect(store.myItems).toEqual([{ transaction_id: 'tx-1', payment_status: 'pending_review' }])
    expect(store.isSaving).toBe(false)
  })

  it('removes admin rows after direct payment and refund operations', async () => {
    apiMocks.listEquipmentUnpaidPaymentItems.mockResolvedValue([
      { transaction_id: 'tx-1' },
      { transaction_id: 'tx-2' }
    ])
    apiMocks.listEquipmentRefundableDirectPaymentItems.mockResolvedValue([
      { transaction_id: 'tx-3' },
      { transaction_id: 'tx-4' }
    ])
    apiMocks.markEquipmentTransactionsPaid.mockResolvedValue(1)
    apiMocks.refundEquipmentTransactions.mockResolvedValue(1)

    const { useEquipmentPaymentsStore } = await import('./equipmentPayments')
    const store = useEquipmentPaymentsStore()

    await store.loadAdminUnpaidItems()
    await store.loadAdminRefundableDirectItems()
    await store.markPaid(['tx-1'])
    await store.refundDirectTransactions(['tx-3'], '測試作廢')

    expect(store.adminUnpaidItems).toEqual([{ transaction_id: 'tx-2' }])
    expect(store.adminRefundableDirectItems).toEqual([{ transaction_id: 'tx-4' }])
  })
})
