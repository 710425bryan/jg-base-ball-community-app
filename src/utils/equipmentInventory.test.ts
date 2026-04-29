import { describe, expect, it } from 'vitest'
import {
  getEquipmentPurchaseAvailability,
  getEquipmentMemberAllocationBalances,
  getEquipmentOverAllocatedSizeQuantity,
  getEquipmentRemainingOverallQuantity,
  getEquipmentRemainingSizeQuantity,
  getEquipmentSizeInventoryList,
  getEquipmentUnassignedAllocatedQuantity,
  isEquipmentPurchasable,
  isEquipmentSerialNumberAvailable,
  validateEquipmentPurchaseItemsAvailability
} from './equipmentInventory'
import type { Equipment, EquipmentTransaction } from '@/types/equipment'

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

const createTransaction = (overrides: Partial<EquipmentTransaction>): EquipmentTransaction => ({
  id: 'transaction-1',
  equipment_id: 'equipment-1',
  transaction_type: 'purchase',
  transaction_date: '2026-04-01',
  member_id: 'm1',
  handled_by: null,
  size: null,
  quantity: 1,
  notes: null,
  unit_price: null,
  request_item_id: null,
  carryover_month: null,
  payment_status: 'unpaid',
  payment_submission_id: null,
  paid_at: null,
  paid_by: null,
  created_at: '',
  updated_at: '',
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

  it('keeps size availability within total availability when old transactions have no size', () => {
    const equipment = createEquipment({
      total_quantity: 85,
      sizes_stock: [
        { size: '15-17CM', quantity: 17 },
        { size: '17-20CM', quantity: 60 },
        { size: '22-26CM', quantity: 8 }
      ],
      equipment_transactions: [
        createTransaction({ id: 't1', size: '15-17CM', quantity: 17 }),
        createTransaction({ id: 't2', size: '17-20CM', quantity: 23 }),
        createTransaction({ id: 't3', size: '22-26CM', quantity: 8 }),
        createTransaction({ id: 't4', size: null, quantity: 3 })
      ]
    })

    const sizeInventory = getEquipmentSizeInventoryList(equipment)

    expect(getEquipmentRemainingOverallQuantity(equipment)).toBe(34)
    expect(getEquipmentUnassignedAllocatedQuantity(equipment)).toBe(3)
    expect(sizeInventory.find((item) => item.size === '17-20CM')?.remaining).toBe(34)
    expect(sizeInventory.reduce((total, item) => total + item.remaining, 0)).toBe(34)
  })

  it('keeps size availability within total availability when a size is over-reserved', () => {
    const equipment = createEquipment({
      total_quantity: 85,
      sizes_stock: [
        { size: '15-17CM', quantity: 17 },
        { size: '17-20CM', quantity: 60 },
        { size: '22-26CM', quantity: 8 }
      ],
      reserved_request_items: [
        { id: 'r1', request_id: 'request-1', equipment_id: 'equipment-1', size: '15-17CM', quantity: 17, unit_price_snapshot: 150 },
        { id: 'r2', request_id: 'request-1', equipment_id: 'equipment-1', size: '17-20CM', quantity: 23, unit_price_snapshot: 150 },
        { id: 'r3', request_id: 'request-1', equipment_id: 'equipment-1', size: '22-26CM', quantity: 11, unit_price_snapshot: 150 }
      ]
    })

    const sizeInventory = getEquipmentSizeInventoryList(equipment)

    expect(getEquipmentRemainingOverallQuantity(equipment)).toBe(34)
    expect(getEquipmentUnassignedAllocatedQuantity(equipment)).toBe(0)
    expect(getEquipmentOverAllocatedSizeQuantity(equipment)).toBe(3)
    expect(sizeInventory.find((item) => item.size === '17-20CM')?.remaining).toBe(34)
    expect(sizeInventory.reduce((total, item) => total + item.remaining, 0)).toBe(34)
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

  it('blocks purchase when stock is exhausted for equipment without sizes', () => {
    const equipment = createEquipment({
      sizes_stock: [],
      total_quantity: 2,
      equipment_transactions: [
        createTransaction({ id: 't1', size: null, quantity: 2 })
      ]
    })

    const availability = getEquipmentPurchaseAvailability(equipment, { quantity: 1 })

    expect(isEquipmentPurchasable(equipment)).toBe(false)
    expect(availability.availableQuantity).toBe(0)
    expect(availability.isPurchasable).toBe(false)
    expect(availability.reason).toBe('此商品已售完')
  })

  it('keeps sold-out sizes visible while allowing sizes with stock', () => {
    const equipment = createEquipment({
      sizes_stock: [
        { size: 'M', quantity: 1 },
        { size: 'L', quantity: 2 }
      ],
      equipment_transactions: [
        createTransaction({ id: 't1', size: 'M', quantity: 1 })
      ]
    })

    const sizeInventory = getEquipmentSizeInventoryList(equipment)
    const medium = getEquipmentPurchaseAvailability(equipment, { size: 'M', quantity: 1 })
    const large = getEquipmentPurchaseAvailability(equipment, { size: 'L', quantity: 2 })

    expect(sizeInventory.map((item) => item.size)).toEqual(['M', 'L'])
    expect(medium.isPurchasable).toBe(false)
    expect(medium.reason).toBe('此尺寸「M」已售完')
    expect(large.isPurchasable).toBe(true)
  })

  it('blocks cart quantities that exceed the remaining size stock', () => {
    const equipment = createEquipment({
      sizes_stock: [
        { size: 'M', quantity: 2 }
      ]
    })

    const validation = validateEquipmentPurchaseItemsAvailability([
      { equipment_id: equipment.id, size: 'M', quantity: 1 },
      { equipment_id: equipment.id, size: 'M', quantity: 2 }
    ], new Map([[equipment.id, equipment]]))

    expect(validation.isValid).toBe(false)
    expect(validation.failures[0]?.availableQuantity).toBe(2)
    expect(validation.failures[0]?.reason).toContain('此尺寸「M」剩 2 件')
  })

  it('blocks cart quantities that exceed the overall equipment stock across sizes', () => {
    const equipment = createEquipment({
      total_quantity: 2,
      sizes_stock: [
        { size: 'M', quantity: 2 },
        { size: 'L', quantity: 2 }
      ]
    })

    const validation = validateEquipmentPurchaseItemsAvailability([
      { equipment_id: equipment.id, size: 'M', quantity: 2 },
      { equipment_id: equipment.id, size: 'L', quantity: 1 }
    ], new Map([[equipment.id, equipment]]))

    expect(validation.isValid).toBe(false)
    expect(validation.failures[0]?.availableQuantity).toBe(2)
    expect(validation.failures[0]?.reason).toContain('商品可用庫存不足')
  })

  it('does not deduct pending request items from the purchase availability snapshot', () => {
    const equipment = createEquipment({
      total_quantity: 2,
      sizes_stock: [],
      reserved_request_items: []
    })

    expect(getEquipmentPurchaseAvailability(equipment, { quantity: 2 }).isPurchasable).toBe(true)
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
