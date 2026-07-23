import type { Equipment, EquipmentInventoryAdjustmentType } from '@/types/equipment'
import {
  getEquipmentAvailablePurchaseQuantity,
  getEquipmentRemainingOverallQuantity
} from '@/utils/equipmentInventory'

const normalizeQuantity = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(Math.floor(parsed), 0) : 0
}

const normalizeSize = (value?: string | null) => String(value || '').trim()

export const getSignedEquipmentInventoryAdjustmentQuantity = (
  adjustmentType: EquipmentInventoryAdjustmentType,
  quantity: unknown
) => {
  const normalizedQuantity = normalizeQuantity(quantity)
  if (normalizedQuantity === 0) return 0
  return adjustmentType === 'stock_out' ? -normalizedQuantity : normalizedQuantity
}

export const getEquipmentInventoryReductionLimit = (
  equipment: Partial<Equipment> | null | undefined,
  size?: string | null
) => getEquipmentAvailablePurchaseQuantity(equipment, normalizeSize(size))

export const getEquipmentInventoryAdjustmentPreview = (
  equipment: Equipment | null | undefined,
  adjustmentType: EquipmentInventoryAdjustmentType,
  size: string | null | undefined,
  quantity: unknown
) => {
  const normalizedSize = normalizeSize(size)
  const signedQuantity = getSignedEquipmentInventoryAdjustmentQuantity(adjustmentType, quantity)
  const currentTotal = Math.max(Number(equipment?.total_quantity || 0), 0)
  const currentAvailable = getEquipmentRemainingOverallQuantity(equipment)
  const nextTotal = Math.max(currentTotal + signedQuantity, 0)
  const nextSizesStock = (equipment?.sizes_stock || []).map((item) => ({ ...item }))
  const existingSize = nextSizesStock.find((item) => normalizeSize(item.size) === normalizedSize)
  const currentSizeStockQuantity = existingSize
    ? Math.max(Number(existingSize.quantity || 0), 0)
    : 0

  if (normalizedSize && existingSize) {
    existingSize.quantity = Math.max(currentSizeStockQuantity + signedQuantity, 0)
  } else if (normalizedSize && adjustmentType === 'stock_in') {
    nextSizesStock.push({ size: normalizedSize, quantity: Math.max(signedQuantity, 0) })
  }

  const nextEquipment = equipment
    ? { ...equipment, total_quantity: nextTotal, sizes_stock: nextSizesStock }
    : null

  return {
    currentTotal,
    currentAvailable,
    nextTotal,
    nextAvailable: getEquipmentRemainingOverallQuantity(nextEquipment),
    currentSizeStockQuantity,
    nextSizeStockQuantity: existingSize
      ? Math.max(Number(existingSize.quantity || 0), 0)
      : adjustmentType === 'stock_in' && normalizedSize
        ? Math.max(signedQuantity, 0)
        : 0,
    signedQuantity,
    nextSizesStock
  }
}
