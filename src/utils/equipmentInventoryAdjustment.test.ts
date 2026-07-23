import { describe, expect, it } from 'vitest'
import type { Equipment } from '@/types/equipment'
import {
  getEquipmentInventoryAdjustmentPreview,
  getEquipmentInventoryReductionLimit,
  getSignedEquipmentInventoryAdjustmentQuantity
} from './equipmentInventoryAdjustment'

const equipment = {
  id: 'equipment-1',
  name: '球衣',
  total_quantity: 10,
  sizes_stock: [
    { size: 'M', quantity: 4 },
    { size: 'L', quantity: 6 }
  ],
  inventory_snapshot: [
    { equipment_id: 'equipment-1', size: 'M', used_quantity: 1, reserved_quantity: 1 },
    { equipment_id: 'equipment-1', size: 'L', used_quantity: 1, reserved_quantity: 0 }
  ]
} as Equipment

describe('equipmentInventoryAdjustment', () => {
  it('converts stock-out quantities to a signed negative RPC delta', () => {
    expect(getSignedEquipmentInventoryAdjustmentQuantity('stock_in', 3)).toBe(3)
    expect(getSignedEquipmentInventoryAdjustmentQuantity('stock_out', 3)).toBe(-3)
    expect(getSignedEquipmentInventoryAdjustmentQuantity('stock_out', -3)).toBe(0)
  })

  it('limits a reduction to both overall and selected-size availability', () => {
    expect(getEquipmentInventoryReductionLimit(equipment, 'M')).toBe(2)
    expect(getEquipmentInventoryReductionLimit(equipment, 'L')).toBe(5)
  })

  it('previews a stock reduction without changing the source equipment', () => {
    const preview = getEquipmentInventoryAdjustmentPreview(equipment, 'stock_out', 'M', 2)

    expect(preview).toMatchObject({
      currentTotal: 10,
      currentAvailable: 7,
      nextTotal: 8,
      nextAvailable: 5,
      currentSizeStockQuantity: 4,
      nextSizeStockQuantity: 2,
      signedQuantity: -2
    })
    expect(equipment.total_quantity).toBe(10)
    expect(equipment.sizes_stock[0]?.quantity).toBe(4)
  })

  it('adds a new size only for stock-in adjustments', () => {
    const stockIn = getEquipmentInventoryAdjustmentPreview(equipment, 'stock_in', 'XL', 2)
    const stockOut = getEquipmentInventoryAdjustmentPreview(equipment, 'stock_out', 'XL', 2)

    expect(stockIn.nextSizesStock).toContainEqual({ size: 'XL', quantity: 2 })
    expect(stockOut.nextSizesStock).not.toContainEqual(expect.objectContaining({ size: 'XL' }))
  })
})
