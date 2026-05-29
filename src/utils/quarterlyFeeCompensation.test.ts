import { describe, expect, it } from 'vitest'
import {
  buildQuarterlyFeeCompensationMonthSummary,
  calculateQuarterlyFeeCompensationAmount,
  normalizeQuarterlyFeeCompensationDefaults
} from './quarterlyFeeCompensation'

describe('quarterlyFeeCompensation', () => {
  it('does not compensate when configured training dates reach the monthly Saturday count', () => {
    const summary = buildQuarterlyFeeCompensationMonthSummary({
      month: '2026-05',
      trainingDates: [
        '2026-05-02',
        '2026-05-09',
        '2026-05-16',
        '2026-05-24',
        '2026-05-30'
      ]
    })

    expect(summary.baselineSessionCount).toBe(5)
    expect(summary.configuredSessionCount).toBe(5)
    expect(summary.compensationDays).toBe(0)
  })

  it('compensates for the difference between monthly Saturdays and configured training date count', () => {
    const summary = buildQuarterlyFeeCompensationMonthSummary({
      month: '2026-05',
      trainingDates: [
        '2026-05-02',
        '2026-05-16',
        '2026-05-30'
      ]
    })

    expect(summary.baselineSessionCount).toBe(5)
    expect(summary.configuredSessionCount).toBe(3)
    expect(summary.compensationDays).toBe(2)
  })

  it('counts any configured date in the month as one training day', () => {
    const summary = buildQuarterlyFeeCompensationMonthSummary({
      month: '2026-05',
      trainingDates: [
        '2026-05-02',
        '2026-05-08',
        '2026-05-16',
        '2026-05-24'
      ]
    })

    expect(summary.configuredTrainingDates).toEqual([
      '2026-05-02',
      '2026-05-08',
      '2026-05-16',
      '2026-05-24'
    ])
    expect(summary.compensationDays).toBe(1)
  })

  it('calculates regular and discounted compensation amounts from configurable daily credits', () => {
    expect(calculateQuarterlyFeeCompensationAmount({
      compensationDays: 2,
      isDiscounted: false
    })).toBe(1000)

    expect(calculateQuarterlyFeeCompensationAmount({
      compensationDays: 2,
      isDiscounted: true
    })).toBe(500)
  })

  it('normalizes configurable daily credit defaults', () => {
    expect(normalizeQuarterlyFeeCompensationDefaults({
      regularDailyCredit: 650.8,
      discountDailyCredit: -20
    })).toEqual({
      regularDailyCredit: 650,
      discountDailyCredit: 0
    })
  })
})
