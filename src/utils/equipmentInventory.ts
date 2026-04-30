import type {
  Equipment,
  EquipmentReservedRequestItem,
  EquipmentTransaction
} from '@/types/equipment'

export const OUTGOING_EQUIPMENT_TRANSACTION_TYPES = ['borrow', 'receive', 'purchase'] as const

const RETURN_TRANSACTION_TYPE = 'return'

export type EquipmentPurchaseValidationItem = {
  equipment_id: string
  size?: string | null
  jersey_number?: number | string | null
  quantity?: number | null
}

export type EquipmentPurchaseAvailability = {
  equipmentId: string
  equipmentName: string
  size: string | null
  hasSizeOptions: boolean
  requestedQuantity: number
  existingQuantity: number
  totalRequestedQuantity: number
  availableQuantity: number
  isPurchasable: boolean
  reason: string | null
}

export type EquipmentPurchaseAvailabilityFailure = {
  equipmentId: string
  equipmentName: string
  size: string | null
  requestedQuantity: number
  availableQuantity: number
  reason: string
}

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeQuantity = (quantity: unknown) => {
  if (quantity === null || quantity === undefined) return 1
  return normalizeNumber(quantity, 1)
}

const normalizeRequestedQuantity = (quantity: unknown) => {
  const parsed = normalizeNumber(quantity, 0)
  return Math.max(0, Math.floor(parsed))
}

const normalizeSize = (size?: string | null) => {
  const value = String(size || '').trim()
  return value || null
}

const normalizeJerseyNumber = (value?: number | string | null) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : null
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

const getEquipmentTotalAllocatedQuantity = (
  equipment: Partial<Equipment> | null | undefined
) => {
  const transactions = Array.isArray(equipment?.equipment_transactions)
    ? equipment?.equipment_transactions || []
    : []
  const reservedRequestItems = Array.isArray(equipment?.reserved_request_items)
    ? equipment?.reserved_request_items || []
    : []

  return getEquipmentNetAllocatedQuantity(transactions) + getReservedRequestQuantity(reservedRequestItems)
}

const getSizeAllocatedQuantity = (
  equipment: Partial<Equipment> | null | undefined,
  size: string
) => {
  const transactions = Array.isArray(equipment?.equipment_transactions)
    ? equipment?.equipment_transactions || []
    : []
  const reservedRequestItems = Array.isArray(equipment?.reserved_request_items)
    ? equipment?.reserved_request_items || []
    : []

  return Math.max(
    0,
    getEquipmentNetAllocatedQuantity(transactions, { size })
      + getReservedRequestQuantity(reservedRequestItems, { size })
  )
}

const getEquipmentSizeTotalQuantity = (equipment: Partial<Equipment> | null | undefined) => {
  const sizes = Array.isArray(equipment?.sizes_stock) ? equipment?.sizes_stock || [] : []
  return sizes.reduce((total, sizeObj) => total + Math.max(0, normalizeNumber(sizeObj?.quantity)), 0)
}

const getEquipmentAssignedAllocatedQuantity = (
  equipment: Partial<Equipment> | null | undefined,
  options: { capBySizeStock?: boolean } = {}
) => {
  const sizes = Array.isArray(equipment?.sizes_stock) ? equipment?.sizes_stock || [] : []

  return sizes.reduce((total, sizeObj) => {
    const sizeKey = sizeObj?.size || ''
    if (!sizeKey) return total

    const sizeTotal = Math.max(0, normalizeNumber(sizeObj?.quantity))
    const allocated = getSizeAllocatedQuantity(equipment, sizeKey)
    return total + (options.capBySizeStock ? Math.min(sizeTotal, allocated) : allocated)
  }, 0)
}

export const getEquipmentUnassignedAllocatedQuantity = (
  equipment: Partial<Equipment> | null | undefined
) => {
  const allocatedQuantity = getEquipmentTotalAllocatedQuantity(equipment)
  const assignedQuantity = getEquipmentAssignedAllocatedQuantity(equipment)

  return Math.max(0, allocatedQuantity - assignedQuantity)
}

export const getEquipmentOverAllocatedSizeQuantity = (
  equipment: Partial<Equipment> | null | undefined
) => {
  const sizes = Array.isArray(equipment?.sizes_stock) ? equipment?.sizes_stock || [] : []

  return sizes.reduce((total, sizeObj) => {
    const sizeKey = sizeObj?.size || ''
    if (!sizeKey) return total

    const sizeTotal = Math.max(0, normalizeNumber(sizeObj?.quantity))
    const allocated = getSizeAllocatedQuantity(equipment, sizeKey)
    return total + Math.max(0, allocated - sizeTotal)
  }, 0)
}

const getEquipmentUnrepresentedAllocatedQuantity = (
  equipment: Partial<Equipment> | null | undefined
) => {
  const totalQuantity = Math.max(0, normalizeNumber(equipment?.total_quantity))
  const spareQuantityWithoutSize = Math.max(0, totalQuantity - getEquipmentSizeTotalQuantity(equipment))
  const unrepresentedAllocatedQuantity = getEquipmentTotalAllocatedQuantity(equipment)
    - getEquipmentAssignedAllocatedQuantity(equipment, { capBySizeStock: true })

  return Math.max(0, unrepresentedAllocatedQuantity - spareQuantityWithoutSize)
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
  let unrepresentedAllocatedQuantity = getEquipmentUnrepresentedAllocatedQuantity(equipment)

  return sizes.map((sizeObj) => {
    const sizeKey = sizeObj?.size || ''
    const total = Math.max(0, normalizeNumber(sizeObj?.quantity))
    const used = getEquipmentNetAllocatedQuantity(transactions, { size: sizeKey })
    const reserved = getReservedRequestQuantity(reservedRequestItems, { size: sizeKey })
    const memberUsed = memberId
      ? getEquipmentNetAllocatedQuantity(transactions, { size: sizeKey, memberId })
      : 0
    const rawRemaining = clamp(total - used - reserved, 0, total)
    const unrepresentedUsed = Math.min(rawRemaining, unrepresentedAllocatedQuantity)
    unrepresentedAllocatedQuantity -= unrepresentedUsed

    return {
      size: sizeKey,
      total,
      used: Math.max(0, used),
      reserved: Math.max(0, reserved),
      unrepresentedUsed,
      remaining: rawRemaining - unrepresentedUsed,
      memberUsed: Math.max(0, memberUsed)
    }
  })
}

export const getEquipmentRemainingSizeQuantity = (
  equipment: Partial<Equipment> | null | undefined,
  size?: string | null
) => {
  const targetSize = normalizeSize(size)
  if (!targetSize) return 0
  const sizeInfo = getEquipmentSizeInventoryList(equipment).find((item) => item.size === targetSize)
  return sizeInfo ? sizeInfo.remaining : 0
}

export const isEquipmentSerialNumberAvailable = (
  equipment: Partial<Equipment> | null | undefined,
  size?: string | null
) => getEquipmentRemainingSizeQuantity(equipment, size) > 0

export const getEquipmentAvailablePurchaseQuantity = (
  equipment: Partial<Equipment> | null | undefined,
  size?: string | null
) => {
  const overallRemaining = getEquipmentRemainingOverallQuantity(equipment)
  const sizeOptions = getEquipmentSizeInventoryList(equipment)
  const targetSize = normalizeSize(size)

  if (sizeOptions.length === 0) return overallRemaining
  if (!targetSize) return 0

  return Math.max(0, Math.min(overallRemaining, getEquipmentRemainingSizeQuantity(equipment, targetSize)))
}

export const isEquipmentPurchasable = (equipment: Partial<Equipment> | null | undefined) => {
  const sizeOptions = getEquipmentSizeInventoryList(equipment)
  if (sizeOptions.length > 0) return sizeOptions.some((item) => item.remaining > 0)
  return getEquipmentRemainingOverallQuantity(equipment) > 0
}

export const getEquipmentPurchaseAvailability = (
  equipment: Partial<Equipment> | null | undefined,
  options: {
    size?: string | null
    quantity?: unknown
    existingQuantity?: unknown
  } = {}
): EquipmentPurchaseAvailability => {
  const targetSize = normalizeSize(options.size)
  const requestedQuantity = normalizeRequestedQuantity(options.quantity)
  const existingQuantity = normalizeRequestedQuantity(options.existingQuantity)
  const totalRequestedQuantity = requestedQuantity + existingQuantity
  const sizeOptions = getEquipmentSizeInventoryList(equipment)
  const hasSizeOptions = sizeOptions.length > 0
  const equipmentId = String(equipment?.id || '')
  const equipmentName = String(equipment?.name || '裝備')

  if (hasSizeOptions && !targetSize) {
    return {
      equipmentId,
      equipmentName,
      size: null,
      hasSizeOptions,
      requestedQuantity,
      existingQuantity,
      totalRequestedQuantity,
      availableQuantity: 0,
      isPurchasable: false,
      reason: '請先選擇尺寸或序號'
    }
  }

  const availableQuantity = getEquipmentAvailablePurchaseQuantity(equipment, targetSize)
  const sizeLabel = targetSize ? `「${targetSize}」` : ''
  let reason: string | null = null

  if (requestedQuantity <= 0) {
    reason = '請先填寫加購數量'
  } else if (availableQuantity <= 0) {
    reason = hasSizeOptions ? `此尺寸${sizeLabel}已售完` : '此商品已售完'
  } else if (totalRequestedQuantity > availableQuantity) {
    reason = hasSizeOptions
      ? `此尺寸${sizeLabel}剩 ${availableQuantity} 件`
      : `商品可用庫存不足，剩 ${availableQuantity} 件`
  }

  return {
    equipmentId,
    equipmentName,
    size: targetSize,
    hasSizeOptions,
    requestedQuantity,
    existingQuantity,
    totalRequestedQuantity,
    availableQuantity,
    isPurchasable: !reason,
    reason
  }
}

export const validateEquipmentPurchaseItemsAvailability = (
  items: EquipmentPurchaseValidationItem[] = [],
  equipmentById: ReadonlyMap<string, Partial<Equipment> | null | undefined>
) => {
  const groupedItems = new Map<string, EquipmentPurchaseValidationItem & { quantity: number }>()

  for (const item of items) {
    const equipmentId = String(item?.equipment_id || '')
    if (!equipmentId) continue
    const size = normalizeSize(item.size)
    const key = `${equipmentId}::${size || ''}`
    const quantity = normalizeRequestedQuantity(item.quantity)
    const current = groupedItems.get(key)

    if (current) {
      current.quantity += quantity
    } else {
      groupedItems.set(key, {
        equipment_id: equipmentId,
        size,
        quantity
      })
    }
  }

  const failures: EquipmentPurchaseAvailabilityFailure[] = []
  const requestedByEquipmentId = new Map<string, number>()

  for (const item of groupedItems.values()) {
    requestedByEquipmentId.set(
      item.equipment_id,
      (requestedByEquipmentId.get(item.equipment_id) || 0) + item.quantity
    )

    const equipment = equipmentById.get(item.equipment_id)
    const equipmentName = String(equipment?.name || '未知裝備')

    if (!equipment) {
      failures.push({
        equipmentId: item.equipment_id,
        equipmentName,
        size: item.size || null,
        requestedQuantity: item.quantity,
        availableQuantity: 0,
        reason: `${equipmentName} 找不到裝備資料`
      })
      continue
    }

    if (!equipment.quick_purchase_enabled) {
      failures.push({
        equipmentId: item.equipment_id,
        equipmentName,
        size: item.size || null,
        requestedQuantity: item.quantity,
        availableQuantity: 0,
        reason: `${equipmentName} 目前未開放加購`
      })
      continue
    }

    if (normalizeNumber(equipment.purchase_price) <= 0) {
      failures.push({
        equipmentId: item.equipment_id,
        equipmentName,
        size: item.size || null,
        requestedQuantity: item.quantity,
        availableQuantity: 0,
        reason: `${equipmentName} 尚未設定加購售價`
      })
      continue
    }

    const availability = getEquipmentPurchaseAvailability(equipment, {
      size: item.size,
      quantity: item.quantity
    })

    if (!availability.isPurchasable) {
      failures.push({
        equipmentId: item.equipment_id,
        equipmentName,
        size: availability.size,
        requestedQuantity: availability.totalRequestedQuantity,
        availableQuantity: availability.availableQuantity,
        reason: `${equipmentName}${availability.size ? ` ${availability.size}` : ''}：${availability.reason || '庫存不足'}`
      })
    }
  }

  const seenJerseyNumbers = new Set<string>()
  for (const item of items) {
    const equipmentId = String(item?.equipment_id || '')
    if (!equipmentId) continue

    const equipment = equipmentById.get(equipmentId)
    if (!equipment?.requires_jersey_number) continue

    const equipmentName = String(equipment.name || '未知裝備')
    const quantity = normalizeRequestedQuantity(item.quantity)
    const jerseyNumber = normalizeJerseyNumber(item.jersey_number)
    const minNumber = normalizeNumber(equipment.jersey_number_min, 0)
    const maxNumber = normalizeNumber(equipment.jersey_number_max, 99)
    const numberOptions = Array.isArray(equipment.jersey_number_options)
      ? equipment.jersey_number_options
        .map((option) => Number(option))
        .filter((option) => Number.isInteger(option) && option >= 0 && option <= 999)
      : []
    const numberOptionSet = new Set(numberOptions)

    if (jerseyNumber === null) {
      failures.push({
        equipmentId,
        equipmentName,
        size: normalizeSize(item.size),
        requestedQuantity: quantity,
        availableQuantity: 0,
        reason: `${equipmentName} 請選擇球衣號碼`
      })
      continue
    }

    if (numberOptions.length > 0 && !numberOptionSet.has(jerseyNumber)) {
      failures.push({
        equipmentId,
        equipmentName,
        size: normalizeSize(item.size),
        requestedQuantity: quantity,
        availableQuantity: 0,
        reason: `${equipmentName} #${jerseyNumber} 目前不在可選號碼清單`
      })
      continue
    }

    if (numberOptions.length === 0 && (jerseyNumber < minNumber || jerseyNumber > maxNumber)) {
      failures.push({
        equipmentId,
        equipmentName,
        size: normalizeSize(item.size),
        requestedQuantity: quantity,
        availableQuantity: 0,
        reason: `${equipmentName} 球衣號碼需介於 ${minNumber} - ${maxNumber}`
      })
      continue
    }

    if (quantity !== 1) {
      failures.push({
        equipmentId,
        equipmentName,
        size: normalizeSize(item.size),
        requestedQuantity: quantity,
        availableQuantity: 1,
        reason: `${equipmentName} 每件球衣需分別選擇一個號碼`
      })
      continue
    }

    const key = `${equipmentId}::${jerseyNumber}`
    if (seenJerseyNumbers.has(key)) {
      failures.push({
        equipmentId,
        equipmentName,
        size: normalizeSize(item.size),
        requestedQuantity: quantity,
        availableQuantity: 0,
        reason: `${equipmentName} #${jerseyNumber} 已在請購單中`
      })
      continue
    }
    seenJerseyNumbers.add(key)
  }

  for (const [equipmentId, requestedQuantity] of requestedByEquipmentId.entries()) {
    if (failures.some((failure) => failure.equipmentId === equipmentId)) continue

    const equipment = equipmentById.get(equipmentId)
    if (!equipment) continue

    const availableQuantity = getEquipmentRemainingOverallQuantity(equipment)
    if (requestedQuantity > availableQuantity) {
      const equipmentName = String(equipment.name || '未知裝備')
      failures.push({
        equipmentId,
        equipmentName,
        size: null,
        requestedQuantity,
        availableQuantity,
        reason: `${equipmentName}：商品可用庫存不足，剩 ${availableQuantity} 件`
      })
    }
  }

  return {
    isValid: failures.length === 0,
    failures
  }
}

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
