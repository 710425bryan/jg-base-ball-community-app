import { describe, expect, it } from 'vitest'
import {
  EQUIPMENT_REQUEST_STATUS,
  getEquipmentFulfillmentStatusLabel,
  getEquipmentPaymentFulfillmentNote,
  getEquipmentRequestItemStatus,
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

  it('maps request statuses to fulfillment labels and payment notes', () => {
    expect(getEquipmentFulfillmentStatusLabel(EQUIPMENT_REQUEST_STATUS.APPROVED)).toBe('商品未發放')
    expect(getEquipmentFulfillmentStatusLabel(EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP)).toBe('可取貨，未領取')
    expect(getEquipmentPaymentFulfillmentNote(EQUIPMENT_REQUEST_STATUS.APPROVED, 'paid')).toBe('收款已完成，商品尚未發放（已核准 / 待備貨）。')
    expect(getEquipmentPaymentFulfillmentNote(EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP, 'paid')).toBe('收款已完成，商品可取貨，尚未標記已領取。')
    expect(getEquipmentPaymentFulfillmentNote(EQUIPMENT_REQUEST_STATUS.PICKED_UP, 'paid')).toBe('收款已完成，商品已領取。')
    expect(getEquipmentPaymentFulfillmentNote(EQUIPMENT_REQUEST_STATUS.APPROVED, 'refunded')).toBe('付款已退款，商品尚未發放（已核准 / 待備貨）。')
  })

  it('marks approved and ready requests as reserved inventory', () => {
    expect(isEquipmentRequestReservedStatus(EQUIPMENT_REQUEST_STATUS.APPROVED)).toBe(true)
    expect(isEquipmentRequestReservedStatus(EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP)).toBe(true)
    expect(isEquipmentRequestReservedStatus(EQUIPMENT_REQUEST_STATUS.PICKED_UP)).toBe(false)
  })

  it('derives each item fulfillment state from its timestamps while honoring terminal request states', () => {
    expect(getEquipmentRequestItemStatus({}, EQUIPMENT_REQUEST_STATUS.APPROVED)).toBe(
      EQUIPMENT_REQUEST_STATUS.APPROVED
    )
    expect(getEquipmentRequestItemStatus(
      { ready_at: '2026-07-20T01:00:00.000Z' },
      EQUIPMENT_REQUEST_STATUS.APPROVED
    )).toBe(EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP)
    expect(getEquipmentRequestItemStatus(
      {
        ready_at: '2026-07-20T01:00:00.000Z',
        picked_up_at: '2026-07-20T02:00:00.000Z'
      },
      EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP
    )).toBe(EQUIPMENT_REQUEST_STATUS.PICKED_UP)
    expect(getEquipmentRequestItemStatus(
      { ready_at: '2026-07-20T01:00:00.000Z' },
      EQUIPMENT_REQUEST_STATUS.CANCELLED
    )).toBe(EQUIPMENT_REQUEST_STATUS.CANCELLED)
  })

  it('allows equipment payment after a purchase request is approved', () => {
    expect(isEquipmentPaymentPayableRequestStatus(null)).toBe(true)
    expect(isEquipmentPaymentPayableRequestStatus(EQUIPMENT_REQUEST_STATUS.PENDING)).toBe(false)
    expect(isEquipmentPaymentPayableRequestStatus(EQUIPMENT_REQUEST_STATUS.APPROVED)).toBe(true)
    expect(isEquipmentPaymentPayableRequestStatus(EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP)).toBe(true)
    expect(isEquipmentPaymentPayableRequestStatus(EQUIPMENT_REQUEST_STATUS.PICKED_UP)).toBe(true)
    expect(isEquipmentPaymentPayableRequestStatus(EQUIPMENT_REQUEST_STATUS.REJECTED)).toBe(false)
  })

  it('sorts active workflow states before history states', () => {
    expect(getEquipmentRequestStatusSortWeight(EQUIPMENT_REQUEST_STATUS.PENDING)).toBeLessThan(
      getEquipmentRequestStatusSortWeight(EQUIPMENT_REQUEST_STATUS.PICKED_UP)
    )
    expect(getEquipmentRequestStatusSortWeight('unknown')).toBe(99)
  })
})
