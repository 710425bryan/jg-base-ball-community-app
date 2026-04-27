import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import { getDefaultMonthlyFeeSettlementMonth } from './monthlyFeeSettlement'

describe('monthlyFeeSettlement', () => {
  it('uses the previous month before the 25th', () => {
    expect(getDefaultMonthlyFeeSettlementMonth(dayjs('2026-04-24'))).toBe('2026-03')
  })

  it('uses the current month starting on the 25th', () => {
    expect(getDefaultMonthlyFeeSettlementMonth(dayjs('2026-04-25'))).toBe('2026-04')
    expect(getDefaultMonthlyFeeSettlementMonth(dayjs('2026-04-26'))).toBe('2026-04')
  })

  it('handles year boundaries before the 25th', () => {
    expect(getDefaultMonthlyFeeSettlementMonth(dayjs('2026-01-24'))).toBe('2025-12')
  })
})
