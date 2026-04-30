import type { Equipment, EquipmentTransaction } from '@/types/equipment'

export const toEquipmentPriceNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const getEquipmentTransactionUnitPrice = (
  transaction: Pick<EquipmentTransaction, 'unit_price'> | null | undefined,
  equipment: Pick<Equipment, 'purchase_price'> | null | undefined = null
) => toEquipmentPriceNumber(transaction?.unit_price ?? equipment?.purchase_price)

export const getEquipmentTransactionTotalPrice = (
  transaction: Pick<EquipmentTransaction, 'unit_price' | 'quantity'> | null | undefined,
  equipment: Pick<Equipment, 'purchase_price'> | null | undefined = null
) => getEquipmentTransactionUnitPrice(transaction, equipment) * Math.max(Number(transaction?.quantity || 0), 0)

export const getEquipmentRequestItemTotalPrice = (
  item: { unit_price_snapshot?: number | null; quantity?: number | null }
) => toEquipmentPriceNumber(item.unit_price_snapshot) * Math.max(Number(item.quantity || 0), 0)

export const formatEquipmentVariantLabel = (
  item: { size?: string | null; jersey_number?: number | string | null },
  emptyLabel = '無尺寸'
) => {
  const values = [
    item.size ? String(item.size).trim() : '',
    item.jersey_number !== null && item.jersey_number !== undefined && String(item.jersey_number).trim()
      ? `#${String(item.jersey_number).trim()}`
      : ''
  ].filter(Boolean)

  return values.length > 0 ? values.join('｜') : emptyLabel
}
