import { describe, expect, it } from 'vitest'
import {
  getEquipmentMemberAllocationBalances,
  getEquipmentRemainingOverallQuantity,
  getEquipmentRemainingSizeQuantity,
  isEquipmentSerialNumberAvailable
} from './equipmentInventory'
import type { Equipment } from '@/types/equipment'

const createEquipment = (overrides: Partial<Equipment> = {}): Equipment => ({
  id: 'equipment-1',
  name: '打擊手套',
  category: '服飾類',
  specs: null,
  notes: null,
  image_url: null,
  purchase_price: 500,
  quick_purchase_enabled: true,
  total_quantity: 10,
  purchased_by: null,
  sizes_stock: [
    { size: 'M', quantity: 5 },
    { size: 'L', quantity: 5 }
  ],
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
  equipment_transactions: [],
  reserved_request_items: [],
  ...overrides
})

describe('equipmentInventory', () => {
  it('deducts outgoing transactions and replenishes returns', () => {
    const equipment = createEquipment({
      equipment_transactions: [
        { id: 't1', equipment_id: 'equipment-1', transaction_type: 'borrow', transaction_date: '2026-04-01', member_id: 'm1', handled_by: null, size: 'M', quantity: 2, notes: null, unit_price: null, request_item_id: null, carryover_month: null, payment_status: 'unpaid', payment_submission_id: null, paid_at: null, paid_by: null, created_at: '', updated_at: '' },
        { id: 't2', equipment_id: 'equipment-1', transaction_type: 'return', transaction_date: '2026-04-02', member_id: 'm1', handled_by: null, size: 'M', quantity: 1, notes: null, unit_price: null, request_item_id: null, carryover_month: null, payment_status: 'unpaid', payment_submission_id: null, paid_at: null, paid_by: null, created_at: '', updated_at: '' }
      ]
    })

    expect(getEquipmentRemainingOverallQuantity(equipment)).toBe(9)
    expect(getEquipmentRemainingSizeQuantity(equipment, 'M')).toBe(4)
  })

  it('counts reserved request items before pickup', () => {
    const equipment = createEquipment({
      reserved_request_items: [
        { id: 'r1', request_id: 'request-1', equipment_id: 'equipment-1', size: 'L', quantity: 3, unit_price_snapshot: 500 }
      ]
    })

    expect(getEquipmentRemainingOverallQuantity(equipment)).toBe(7)
    expect(getEquipmentRemainingSizeQuantity(equipment, 'L')).toBe(2)
    expect(isEquipmentSerialNumberAvailable(equipment, 'L')).toBe(true)
  })

  it('returns per-member active allocation balances', () => {
    const balances = getEquipmentMemberAllocationBalances([
      { id: 't1', equipment_id: 'equipment-1', transaction_type: 'borrow', transaction_date: '2026-04-01', member_id: 'm1', handled_by: null, size: null, quantity: 2, notes: null, unit_price: null, request_item_id: null, carryover_month: null, payment_status: 'unpaid', payment_submission_id: null, paid_at: null, paid_by: null, created_at: '', updated_at: '' },
      { id: 't2', equipment_id: 'equipment-1', transaction_type: 'receive', transaction_date: '2026-04-01', member_id: 'm2', handled_by: null, size: null, quantity: 1, notes: null, unit_price: null, request_item_id: null, carryover_month: null, payment_status: 'unpaid', payment_submission_id: null, paid_at: null, paid_by: null, created_at: '', updated_at: '' },
      { id: 't3', equipment_id: 'equipment-1', transaction_type: 'return', transaction_date: '2026-04-02', member_id: 'm1', handled_by: null, size: null, quantity: 1, notes: null, unit_price: null, request_item_id: null, carryover_month: null, payment_status: 'unpaid', payment_submission_id: null, paid_at: null, paid_by: null, created_at: '', updated_at: '' }
    ])

    expect(balances).toEqual({ m1: 1, m2: 1 })
  })
})
