import type {
  Equipment,
  EquipmentReservedRequestItem,
  EquipmentTransaction
} from '@/types/equipment'

export const OUTGOING_EQUIPMENT_TRANSACTION_TYPES = ['borrow', 'receive', 'purchase'] as const

const RETURN_TRANSACTION_TYPE = 'return'

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeQuantity = (quantity: unknown) => {
  if (quantity === null || quantity === undefined) return 1
  return normalizeNumber(quantity, 1)
}

const clamp = (value: number, min = 0, max = Number.POSITIVE_INFINITY) =>
  Math.min(max, Math.max(min, value))

export const isOutgoingEquipmentTransactionType = (transactionType?: string | null) =>
  OUTGOING_EQUIPMENT_TRANSACTION_TYPES.includes(transactionType as any)

export const getEquipmentNetAllocatedQuantity = (
  transactions: EquipmentTransaction[] = [],
  filters: { size?: string | null; memberId?: string | null } = {}
) => {
  const { size, memberId } = filters

  return transactions.reduce((total, transaction) => {
    if (!transaction) return total
    if (size && transaction.size !== size) return total
    if (memberId && transaction.member_id !== memberId) return total

    const quantity = normalizeQuantity(transaction.quantity)

    if (isOutgoingEquipmentTransactionType(transaction.transaction_type)) {
      return total + quantity
    }

    if (transaction.transaction_type === RETURN_TRANSACTION_TYPE) {
      return total - quantity
    }

    return total
  }, 0)
}

const getReservedRequestQuantity = (
  items: EquipmentReservedRequestItem[] = [],
  filters: { size?: string | null } = {}
) => {
  const { size } = filters

  return items.reduce((total, item) => {
    if (!item) return total
    if (size && item.size !== size) return total
    return total + normalizeQuantity(item.quantity)
  }, 0)
}

export const getEquipmentRemainingOverallQuantity = (equipment: Partial<Equipment> | null | undefined) => {
  const totalQuantity = Math.max(0, normalizeNumber(equipment?.total_quantity))
  const allocatedQuantity = getEquipmentNetAllocatedQuantity(equipment?.equipment_transactions || [])
  const reservedQuantity = getReservedRequestQuantity(equipment?.reserved_request_items || [])
  return clamp(totalQuantity - allocatedQuantity - reservedQuantity, 0, totalQuantity)
}

export const getEquipmentSizeInventoryList = (
  equipment: Partial<Equipment> | null | undefined,
  options: { memberId?: string | null } = {}
) => {
  const { memberId = null } = options
  const sizes = Array.isArray(equipment?.sizes_stock) ? equipment?.sizes_stock || [] : []
  const transactions = Array.isArray(equipment?.equipment_transactions)
    ? equipment?.equipment_transactions || []
    : []
  const reservedRequestItems = Array.isArray(equipment?.reserved_request_items)
    ? equipment?.reserved_request_items || []
    : []

  return sizes.map((sizeObj) => {
    const sizeKey = sizeObj?.size || ''
    const total = Math.max(0, normalizeNumber(sizeObj?.quantity))
    const used = getEquipmentNetAllocatedQuantity(transactions, { size: sizeKey })
    const reserved = getReservedRequestQuantity(reservedRequestItems, { size: sizeKey })
    const memberUsed = memberId
      ? getEquipmentNetAllocatedQuantity(transactions, { size: sizeKey, memberId })
      : 0

    return {
      size: sizeKey,
      total,
      used: Math.max(0, used),
      reserved: Math.max(0, reserved),
      remaining: clamp(total - used - reserved, 0, total),
      memberUsed: Math.max(0, memberUsed)
    }
  })
}

export const getEquipmentRemainingSizeQuantity = (
  equipment: Partial<Equipment> | null | undefined,
  size?: string | null
) => {
  if (!size) return 0
  const sizeInfo = getEquipmentSizeInventoryList(equipment).find((item) => item.size === size)
  return sizeInfo ? sizeInfo.remaining : 0
}

export const isEquipmentSerialNumberAvailable = (
  equipment: Partial<Equipment> | null | undefined,
  size?: string | null
) => getEquipmentRemainingSizeQuantity(equipment, size) > 0

export const getEquipmentMemberAllocationBalances = (transactions: EquipmentTransaction[] = []) => {
  return transactions.reduce<Record<string, number>>((balances, transaction) => {
    if (!transaction?.member_id) return balances

    const currentBalance = balances[transaction.member_id] || 0
    const quantity = normalizeQuantity(transaction.quantity)

    if (isOutgoingEquipmentTransactionType(transaction.transaction_type)) {
      balances[transaction.member_id] = currentBalance + quantity
    } else if (transaction.transaction_type === RETURN_TRANSACTION_TYPE) {
      balances[transaction.member_id] = Math.max(0, currentBalance - quantity)
    }

    return balances
  }, {})
}
