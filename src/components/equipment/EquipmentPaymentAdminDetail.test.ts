// @vitest-environment jsdom

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EquipmentPaymentAdminDetail from './EquipmentPaymentAdminDetail.vue'
import type { EquipmentPaymentAdminRecord } from '@/utils/equipmentPurchaseAdmin'

const storeMock = vi.hoisted(() => ({
  markPaid: vi.fn(),
  reviewSubmission: vi.fn(),
  refundSubmission: vi.fn(),
  refundDirectTransactions: vi.fn()
}))
const confirmMock = vi.hoisted(() => vi.fn())

vi.mock('@/stores/equipmentPayments', () => ({ useEquipmentPaymentsStore: () => storeMock }))
vi.mock('@/utils/pushNotifications', () => ({
  buildPushEventKey: vi.fn(() => 'event-key'),
  dispatchPushNotification: vi.fn()
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: confirmMock, prompt: vi.fn() }
}))

const record = {
  key: 'transaction:transaction-1',
  id: 'transaction-1',
  area: 'payments',
  recordType: 'transaction',
  status: 'unpaid',
  statusLabel: '尚未付款',
  memberName: '王小明',
  equipmentSummary: '球衣',
  amount: 1000,
  date: '2026-07-15',
  searchText: '王小明 球衣',
  subtype: 'transaction',
  source: {
    transaction_id: 'transaction-1',
    request_id: null,
    member_id: 'member-1',
    member_name: '王小明',
    equipment_id: 'equipment-1',
    equipment_name: '球衣',
    size: 'M',
    jersey_number: null,
    quantity: 2,
    unit_price: 500,
    total_amount: 1000,
    payment_status: 'unpaid',
    payment_submission_id: null,
    transaction_date: '2026-07-15',
    request_status: 'approved',
    picked_up_at: null
  }
} as EquipmentPaymentAdminRecord

describe('EquipmentPaymentAdminDetail', () => {
  beforeEach(() => {
    storeMock.markPaid.mockReset().mockResolvedValue(1)
    confirmMock.mockReset().mockResolvedValue(undefined)
  })

  it('keeps mutation actions hidden for fees view-only users', () => {
    const wrapper = mount(EquipmentPaymentAdminDetail, {
      props: { record, canEdit: false },
      global: { stubs: { ElIcon: true, ElDropdownItem: true } }
    })

    expect(wrapper.text()).not.toContain('標記已收款')
  })

  it('marks an unpaid transaction paid and asks the parent to refresh', async () => {
    const wrapper = mount(EquipmentPaymentAdminDetail, {
      props: { record, canEdit: true },
      global: { stubs: { ElIcon: true, ElDropdownItem: true } }
    })

    const paidButton = wrapper.get('button')
    expect(paidButton.classes()).toContain('bg-sky-700')
    await paidButton.trigger('click')
    await Promise.resolve()
    await Promise.resolve()

    expect(storeMock.markPaid).toHaveBeenCalledWith(['transaction-1'])
    expect(wrapper.emitted('changed')?.[0]).toEqual([record.key])
  })

  it('uses the legacy orange warning treatment for a refundable direct payment', () => {
    const refundableRecord = {
      ...record,
      status: 'refundable',
      statusLabel: '已收款可退款'
    } as EquipmentPaymentAdminRecord
    const wrapper = mount(EquipmentPaymentAdminDetail, {
      props: { record: refundableRecord, canEdit: true },
      global: { stubs: { ElIcon: true, ElDropdownItem: true } }
    })

    const refundButton = wrapper.get('button')
    expect(refundButton.classes()).toEqual(expect.arrayContaining([
      'border-orange-200',
      'bg-orange-50',
      'text-orange-700'
    ]))
  })
})
