import type { EquipmentRequestStatus } from '@/types/equipment'

export const EQUIPMENT_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  READY_FOR_PICKUP: 'ready_for_pickup',
  PICKED_UP: 'picked_up',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
} as const

export const EQUIPMENT_REQUEST_RESERVED_STATUSES: EquipmentRequestStatus[] = [
  EQUIPMENT_REQUEST_STATUS.APPROVED,
  EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP
]

export const EQUIPMENT_REQUEST_HISTORY_STATUSES: EquipmentRequestStatus[] = [
  EQUIPMENT_REQUEST_STATUS.PICKED_UP,
  EQUIPMENT_REQUEST_STATUS.REJECTED,
  EQUIPMENT_REQUEST_STATUS.CANCELLED
]

export const isEquipmentRequestReservedStatus = (status?: string | null) =>
  EQUIPMENT_REQUEST_RESERVED_STATUSES.includes(status as EquipmentRequestStatus)

export const getEquipmentRequestStatusLabel = (status?: string | null) => {
  switch (status) {
    case EQUIPMENT_REQUEST_STATUS.PENDING:
      return '待審核'
    case EQUIPMENT_REQUEST_STATUS.APPROVED:
      return '已核准'
    case EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP:
      return '可取貨'
    case EQUIPMENT_REQUEST_STATUS.PICKED_UP:
      return '已領取'
    case EQUIPMENT_REQUEST_STATUS.REJECTED:
      return '已退回'
    case EQUIPMENT_REQUEST_STATUS.CANCELLED:
      return '已取消'
    default:
      return '未知狀態'
  }
}

export const getEquipmentRequestStatusTagType = (status?: string | null) => {
  switch (status) {
    case EQUIPMENT_REQUEST_STATUS.PENDING:
      return 'warning'
    case EQUIPMENT_REQUEST_STATUS.APPROVED:
      return 'primary'
    case EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP:
      return 'success'
    case EQUIPMENT_REQUEST_STATUS.PICKED_UP:
      return 'success'
    case EQUIPMENT_REQUEST_STATUS.REJECTED:
      return 'danger'
    case EQUIPMENT_REQUEST_STATUS.CANCELLED:
      return 'info'
    default:
      return 'info'
  }
}

export const getEquipmentRequestStatusSortWeight = (status?: string | null) => {
  switch (status) {
    case EQUIPMENT_REQUEST_STATUS.PENDING:
      return 0
    case EQUIPMENT_REQUEST_STATUS.APPROVED:
      return 1
    case EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP:
      return 2
    case EQUIPMENT_REQUEST_STATUS.PICKED_UP:
      return 3
    case EQUIPMENT_REQUEST_STATUS.REJECTED:
      return 4
    case EQUIPMENT_REQUEST_STATUS.CANCELLED:
      return 5
    default:
      return 99
  }
}
