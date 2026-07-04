import { describe, expect, it } from 'vitest'
import {
  BALANCE_PAYMENT_METHOD,
  PAYMENT_METHOD_OPTIONS,
  normalizeAccountLast5,
  requiresAccountLast5
} from './paymentMethods'

describe('paymentMethods', () => {
  it('identifies methods that require account last five digits', () => {
    expect(PAYMENT_METHOD_OPTIONS).toEqual(['銀行轉帳', '郵局', '現金', 'ATM存款'])
    expect(BALANCE_PAYMENT_METHOD).toBe('餘額扣款')
    expect(requiresAccountLast5('銀行轉帳')).toBe(true)
    expect(requiresAccountLast5('郵局無摺')).toBe(true)
    expect(requiresAccountLast5('ATM存款')).toBe(true)
    expect(requiresAccountLast5('現金')).toBe(false)
    expect(requiresAccountLast5(null)).toBe(false)
  })

  it('keeps only the first five digits from account input', () => {
    expect(normalizeAccountLast5(' A1-23 456 ')).toBe('12345')
    expect(normalizeAccountLast5('abc')).toBe('')
    expect(normalizeAccountLast5(null)).toBe('')
  })
})
