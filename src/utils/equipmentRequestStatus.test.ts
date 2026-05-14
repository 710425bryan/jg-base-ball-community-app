import { describe, expect, it } from 'vitest'
import {
  EQUIPMENT_REQUEST_STATUS,
  getEquipmentRequestStatusLabel,
  getEquipmentRequestStatusSortWeight,
  getEquipmentRequestStatusTagType,
  isEquipmentPaymentPayableRequestStatus,
  isEquipmentRequestReservedStatus
} from './equipmentRequestStatus'

describe('equipmentRequestStatus', () => {
  it('maps request statuses to labels and tag types', () => {
    expect(getEquipmentRequestStatusLabel(EQUIPMENT_REQUEST_STATUS.PENDING)).toBe('待審核')
    expect(getEquipmentRequestStatusLabel(EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP)).toBe('可取貨')
    expect(getEquipmentRequestStatusTagType(EQUIPMENT_REQUEST_STATUS.REJECTED)).toBe('danger')
  })

  it('marks approved and ready requests as reserved inventory', () => {
    expect(isEquipmentRequestReservedStatus(EQUIPMENT_REQUEST_STATUS.APPROVED)).toBe(true)
    expect(isEquipmentRequestReservedStatus(EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP)).toBe(true)
    expect(isEquipmentRequestReservedStatus(EQUIPMENT_REQUEST_STATUS.PICKED_UP)).toBe(false)
  })

  it('allows equipment payment after stock is ready for pickup', () => {
    expect(isEquipmentPaymentPayableRequestStatus(null)).toBe(true)
    expect(isEquipmentPaymentPayableRequestStatus(EQUIPMENT_REQUEST_STATUS.APPROVED)).toBe(false)
    expect(isEquipmentPaymentPayableRequestStatus(EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP)).toBe(true)
    expect(isEquipmentPaymentPayableRequestStatus(EQUIPMENT_REQUEST_STATUS.PICKED_UP)).toBe(true)
  })

  it('sorts active workflow states before history states', () => {
    expect(getEquipmentRequestStatusSortWeight(EQUIPMENT_REQUEST_STATUS.PENDING)).toBeLessThan(
      getEquipmentRequestStatusSortWeight(EQUIPMENT_REQUEST_STATUS.PICKED_UP)
    )
    expect(getEquipmentRequestStatusSortWeight('unknown')).toBe(99)
  })
})
