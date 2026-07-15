import { describe, expect, it } from 'vitest'
import type { EquipmentPaymentItem, EquipmentPaymentSubmission, EquipmentPurchaseRequest } from '@/types/equipment'
import {
  buildEquipmentAdminUrl,
  buildEquipmentPaymentAdminRecords,
  buildEquipmentRequestAdminRecords,
  filterEquipmentAdminRecords,
  getEquipmentAdminStatusPresentation,
  getLegacyEquipmentAdminRedirect,
  summarizeEquipmentAdminRecords
} from './equipmentPurchaseAdmin'

const paymentItem = (overrides: Partial<EquipmentPaymentItem> = {}): EquipmentPaymentItem => ({
  transaction_id: 'transaction-1',
  request_id: 'request-1',
  member_id: 'member-1',
  member_name: '王小明',
  equipment_id: 'equipment-1',
  equipment_name: '球衣',
  size: 'M',
  jersey_number: 12,
  quantity: 2,
  unit_price: 500,
  total_amount: 1000,
  payment_status: 'unpaid',
  payment_submission_id: null,
  transaction_date: '2026-07-01',
  request_status: 'approved',
  picked_up_at: null,
  ...overrides
})

const submission = (overrides: Partial<EquipmentPaymentSubmission> = {}): EquipmentPaymentSubmission => ({
  id: 'submission-1',
  profile_id: 'profile-1',
  member_id: 'member-1',
  member_name: '陳小華',
  amount: 1500,
  balance_amount: 500,
  external_amount: 1000,
  payment_method: '銀行轉帳',
  account_last_5: '12345',
  remittance_date: '2026-07-02',
  note: null,
  status: 'pending_review',
  reviewed_at: null,
  reviewed_by: null,
  created_at: '2026-07-02T10:00:00Z',
  updated_at: '2026-07-02T10:00:00Z',
  items: [paymentItem({ transaction_id: 'transaction-2', total_amount: 1500 })],
  ...overrides
})

const request = (overrides: Partial<EquipmentPurchaseRequest> = {}): EquipmentPurchaseRequest => ({
  id: 'request-1',
  member_id: 'member-1',
  requester_user_id: 'profile-1',
  status: 'pending',
  notes: null,
  ready_note: null,
  ready_image_url: null,
  ready_image_urls: [],
  pickup_note: null,
  pickup_image_url: null,
  pickup_image_urls: [],
  rejection_reason: null,
  cancel_reason: null,
  requested_at: '2026-07-01T10:00:00Z',
  requested_by: null,
  approved_at: null,
  approved_by: null,
  ready_at: null,
  ready_by: null,
  picked_up_at: null,
  picked_up_by: null,
  rejected_at: null,
  rejected_by: null,
  cancelled_at: null,
  cancelled_by: null,
  created_at: '2026-07-01T10:00:00Z',
  updated_at: '2026-07-01T10:00:00Z',
  member: { id: 'member-1', name: '林小熊', role: '球員' },
  requester_profile: null,
  items: [{
    id: 'item-1',
    request_id: 'request-1',
    equipment_id: 'equipment-1',
    size: 'M',
    jersey_number: null,
    quantity: 3,
    equipment_name_snapshot: '球帽',
    unit_price_snapshot: 400,
    equipment_transaction_id: null,
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z'
  }],
  ...overrides
})

describe('equipmentPurchaseAdmin', () => {
  it('normalizes payment states and keeps each status amount separate', () => {
    const records = buildEquipmentPaymentAdminRecords({
      unpaidItems: [paymentItem()],
      submissions: [submission(), submission({ id: 'submission-2', status: 'approved', amount: 800 })],
      refundableDirectItems: [paymentItem({ transaction_id: 'transaction-3', total_amount: 600 })]
    })

    expect(filterEquipmentAdminRecords(records, { area: 'payments', status: 'action' })).toHaveLength(2)
    expect(summarizeEquipmentAdminRecords(records, 'payments')).toEqual([
      expect.objectContaining({ status: 'unpaid', count: 1, amount: 1000 }),
      expect.objectContaining({ status: 'review', count: 1, amount: 1500 }),
      expect.objectContaining({ status: 'refundable', count: 2, amount: 1400 })
    ])
  })

  it('calculates request totals from immutable price snapshots', () => {
    const records = buildEquipmentRequestAdminRecords([
      request(),
      request({ id: 'request-2', status: 'approved' }),
      request({ id: 'request-3', status: 'picked_up' })
    ])

    expect(records.map((record) => [record.status, record.amount])).toEqual([
      ['pending', 1200],
      ['processing', 1200],
      ['history', 1200]
    ])
    expect(filterEquipmentAdminRecords(records, { area: 'requests', status: 'action', search: '球帽' })).toHaveLength(2)
  })

  it('builds canonical links and maps legacy fee links without breaking unrelated submissions', () => {
    expect(buildEquipmentAdminUrl({
      area: 'payments',
      status: 'review',
      recordType: 'payment_submission',
      recordId: 'submission-1'
    })).toBe('/equipment-purchases?area=payments&status=review&record_type=payment_submission&record_id=submission-1')

    expect(getLegacyEquipmentAdminRedirect({
      tab: 'equipment',
      highlight_id: 'request-1'
    })).toEqual({
      area: 'requests',
      status: 'action',
      record_type: 'request',
      record_id: 'request-1'
    })
    expect(getLegacyEquipmentAdminRedirect({ highlight_submission_id: 'monthly-1' })).toBeNull()
  })

  it('preserves the original semantic colors and payment guidance copy', () => {
    expect(getEquipmentAdminStatusPresentation('payments', 'unpaid')).toMatchObject({
      title: '裝備款項 / 尚未付款',
      description: '列出已核准、可取貨、已領取或管理員新增，且目前仍標記為尚未付款的裝備交易；若已收款可直接標記為已付款。',
      panelClass: 'border-sky-100 bg-sky-50/70',
      optionActiveClass: expect.stringContaining('bg-sky-700'),
      badgeClass: expect.stringContaining('text-sky-700'),
      selectedRowClass: expect.stringContaining('bg-sky-50')
    })
    expect(getEquipmentAdminStatusPresentation('payments', 'review')).toMatchObject({
      title: '裝備付款 / 待審核',
      panelClass: 'border-emerald-100 bg-emerald-50/70',
      optionActiveClass: expect.stringContaining('bg-emerald-600')
    })
    expect(getEquipmentAdminStatusPresentation('payments', 'refundable')).toMatchObject({
      title: '裝備付款 / 已收款可退款',
      panelClass: 'border-orange-100 bg-orange-50/70',
      optionActiveClass: expect.stringContaining('bg-orange-50')
    })
    expect(getEquipmentAdminStatusPresentation('requests', 'pending').badgeClass).toContain('text-amber-700')
    expect(getEquipmentAdminStatusPresentation('requests', 'processing')).toMatchObject({
      panelClass: 'border-blue-100 bg-blue-50/60',
      optionActiveClass: expect.stringContaining('bg-blue-600'),
      badgeClass: expect.stringContaining('text-blue-700')
    })
  })
})
