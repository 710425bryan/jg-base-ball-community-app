import { describe, expect, it } from 'vitest'
import {
  buildPaymentBreakdownText,
  clampBalanceDeduction,
  getExternalPaymentAmount
} from './playerBalance'

const money = (amount: number) => `$${amount}`

describe('playerBalance', () => {
  it('caps balance deduction by requested amount, payable amount, and current balance', () => {
    expect(clampBalanceDeduction(900, 1200, 500)).toBe(500)
    expect(clampBalanceDeduction(900, 700, 2000)).toBe(700)
    expect(clampBalanceDeduction(300, 700, 2000)).toBe(300)
  })

  it('calculates external payment after balance deduction', () => {
    expect(getExternalPaymentAmount(1200, 500)).toBe(700)
    expect(getExternalPaymentAmount(1200, 1200)).toBe(0)
    expect(getExternalPaymentAmount(1200, 1500)).toBe(0)
  })

  it('builds full-balance and partial-balance payment labels', () => {
    expect(buildPaymentBreakdownText(1200, 0, money)).toBe('外部付款 $1200')
    expect(buildPaymentBreakdownText(1200, 500, money)).toBe('餘額扣抵 $500，外部付款 $700')
    expect(buildPaymentBreakdownText(1200, 1200, money)).toBe('全額使用餘額 $1200')
  })
})
