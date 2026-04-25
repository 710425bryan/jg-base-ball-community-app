import { describe, expect, it } from 'vitest'
import {
  getEquipmentRequestItemTotalPrice,
  getEquipmentTransactionTotalPrice,
  getEquipmentTransactionUnitPrice,
  toEquipmentPriceNumber
} from './equipmentPricing'

describe('equipmentPricing', () => {
  it('normalizes invalid prices to zero', () => {
    expect(toEquipmentPriceNumber('600')).toBe(600)
    expect(toEquipmentPriceNumber('not-a-number')).toBe(0)
  })

  it('prefers transaction unit price over equipment price', () => {
    expect(getEquipmentTransactionUnitPrice({ unit_price: 450 }, { purchase_price: 500 })).toBe(450)
    expect(getEquipmentTransactionUnitPrice({ unit_price: null }, { purchase_price: 500 })).toBe(500)
  })

  it('calculates transaction and request item totals', () => {
    expect(getEquipmentTransactionTotalPrice({ unit_price: 300, quantity: 3 }, null)).toBe(900)
    expect(getEquipmentRequestItemTotalPrice({ unit_price_snapshot: 250, quantity: 2 })).toBe(500)
  })
})
