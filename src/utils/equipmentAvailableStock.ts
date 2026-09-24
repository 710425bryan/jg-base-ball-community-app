import type { Equipment, EquipmentAvailableStock, EquipmentSizeStock } from '@/types/equipment'
import {
  getEquipmentOverAllocatedSizeQuantity,
  getEquipmentNetAllocatedQuantity,
  getEquipmentRemainingOverallQuantity,
  getEquipmentSizeInventoryList,
  getEquipmentUnassignedAllocatedQuantity
} from '@/utils/equipmentInventory'

export const getEquipmentStockIssue = (equipment?: Partial<Equipment> | null) => {
  if (!equipment) return ''
  const sizes = equipment.sizes_stock || []
  const allocated = Array.isArray(equipment.inventory_snapshot)
    ? equipment.inventory_snapshot.reduce((sum, item) => sum + item.used_quantity + item.reserved_quantity, 0)
    : getEquipmentNetAllocatedQuantity(equipment.equipment_transactions || [])
      + (equipment.reserved_request_items || []).reduce((sum, item) => sum + item.quantity, 0)
  if (allocated < 0 || allocated > Number(equipment.total_quantity || 0)) return '庫存資料不一致，請核對目前可用數量與交易紀錄。'
  if (sizes.length === 0) return ''
  if (getEquipmentUnassignedAllocatedQuantity(equipment) > 0) {
    return '有交易尺寸無法對應，請先核對交易與尺寸名稱。'
  }
  if (new Set(sizes.map(item => item.size.trim())).size !== sizes.length) {
    return '庫存資料不一致：尺寸名稱重複，請先整理尺寸並核對可用數量。'
  }
  const overAllocated = getEquipmentOverAllocatedSizeQuantity(equipment)
  if (overAllocated > 0) {
    return `庫存資料不一致：部分尺寸的交易與預留超出庫存 ${overAllocated} 件，請核對交易及實際可用數量。`
  }
  if (sizes.reduce((sum, item) => sum + Number(item.quantity || 0), 0) !== Number(equipment.total_quantity || 0)) {
    const available = getEquipmentRemainingOverallQuantity(equipment)
    const sizeAvailable = getEquipmentSizeInventoryList(equipment).reduce((sum, item) => sum + item.remaining, 0)
    return `庫存資料不一致：目前可用 ${available} 件，各尺寸可用合計 ${sizeAvailable} 件，相差 ${Math.abs(available - sizeAvailable)} 件。請核對各尺寸目前可用數量後儲存。`
  }
  return ''
}

export const getEquipmentAvailableStockDraft = (equipment?: Partial<Equipment> | null): EquipmentAvailableStock => ({
  available_quantity: getEquipmentRemainingOverallQuantity(equipment),
  sizes: getEquipmentSizeInventoryList(equipment).map(item => ({ size: item.size, quantity: item.remaining }))
})

export const normalizeAvailableSizes = (sizes: EquipmentSizeStock[]) => {
  const merged = new Map<string, number>()
  for (const item of sizes) {
    const size = item.size.trim()
    if (!size) {
      if (Number(item.quantity) !== 0) throw new Error('請填寫尺寸名稱')
      continue
    }
    if (item.quantity === null || !Number.isSafeInteger(item.quantity) || item.quantity < 0) {
      throw new Error('可用庫存需為 0 或正整數')
    }
    merged.set(size, (merged.get(size) || 0) + item.quantity)
  }
  return [...merged].map(([size, quantity]) => ({ size, quantity }))
}

export const normalizeAvailableStock = (stock: EquipmentAvailableStock): EquipmentAvailableStock => {
  const sizes = normalizeAvailableSizes(stock.sizes)
  const available = sizes.length ? sizes.reduce((sum, item) => sum + item.quantity, 0) : stock.available_quantity
  if (available === null || !Number.isSafeInteger(available) || available < 0) {
    throw new Error('可用庫存需為 0 或正整數')
  }
  return { available_quantity: available, sizes }
}

// Sorting alone changes catalog order but must not require a stock adjustment reason.
export const hasAvailableQuantityChange = (before: EquipmentAvailableStock, after: EquipmentAvailableStock) => {
  if (before.available_quantity !== after.available_quantity || before.sizes.length !== after.sizes.length) return true
  const quantities = new Map(before.sizes.map(item => [item.size, item.quantity]))
  return after.sizes.some(item => quantities.get(item.size) !== item.quantity)
}

export const hasAvailableQuantityReduction = (before: EquipmentAvailableStock, after: EquipmentAvailableStock) => {
  if (after.available_quantity < before.available_quantity) return true
  const quantities = new Map(after.sizes.map(item => [item.size, item.quantity]))
  return before.sizes.some(item => (quantities.get(item.size) || 0) < item.quantity)
}
