import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  buildMonthlyFeeLeaveDateMap,
  getDefaultMonthlyFeeSettlementMonth,
  getMonthlyFeeTotalSessionsFromTrainingDates
} from './monthlyFeeSettlement'

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

  it('uses the configured training dates count as monthly sessions', () => {
    expect(getMonthlyFeeTotalSessionsFromTrainingDates([
      '2026-05-02',
      '2026-05-09',
      '2026-05-16',
      '2026-05-23',
      '2026-05-30'
    ])).toBe(5)
    expect(getMonthlyFeeTotalSessionsFromTrainingDates([])).toBe(0)
    expect(getMonthlyFeeTotalSessionsFromTrainingDates(null)).toBe(0)
  })

  it('counts every leave request date in the selected month', () => {
    const leaveDateMap = buildMonthlyFeeLeaveDateMap({
      monthStart: '2026-05-01',
      monthEnd: '2026-05-31',
      leaveRequests: [
        { memberId: 'member-1', startDate: '2026-05-01', endDate: '2026-05-10' },
        { memberId: 'member-2', startDate: '2026-05-03', endDate: '2026-05-03' }
      ]
    })

    expect(leaveDateMap.get('member-1')).toHaveLength(10)
    expect(leaveDateMap.get('member-1')).toContain('2026-05-01')
    expect(leaveDateMap.get('member-1')).toContain('2026-05-09')
    expect(leaveDateMap.get('member-1')).not.toContain('2026-05-16')
    expect(leaveDateMap.get('member-2')).toEqual(['2026-05-03'])
  })

  it('counts only leave dates that are configured training dates when provided', () => {
    const leaveDateMap = buildMonthlyFeeLeaveDateMap({
      monthStart: '2026-06-01',
      monthEnd: '2026-06-30',
      trainingDates: ['2026-06-14', '2026-06-27'],
      leaveRequests: [
        { memberId: 'member-1', startDate: '2026-06-14', endDate: '2026-06-14' },
        { memberId: 'member-1', startDate: '2026-06-27', endDate: '2026-06-28' }
      ]
    })

    expect(leaveDateMap.get('member-1')).toEqual(['2026-06-14', '2026-06-27'])
    expect(leaveDateMap.get('member-1')).not.toContain('2026-06-28')
  })
})
