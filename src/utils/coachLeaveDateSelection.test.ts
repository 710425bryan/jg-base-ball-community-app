import { describe, expect, it } from 'vitest'
import type { CoachLeaveDateSelectionState } from '@/types/coachLeaveDateSelection'
import type { CoachLeaveTimeSegment } from '@/types/coachLeaveRequest'
import {
  buildCoachLeaveDateRecords,
  COACH_LEAVE_DATE_MODES,
  createCoachLeaveDateSelection,
  getAdjacentCoachLeaveMonth,
  MAX_COACH_LEAVE_BATCH_RECORDS,
  MAX_COACH_LEAVE_DATE_RANGE_DAYS,
  normalizeCoachLeaveClassDates,
  normalizeCoachLeaveMonth
} from './coachLeaveDateSelection'

const today = '2026-10-02'
const selection = (values: Partial<CoachLeaveDateSelectionState> = {}) => ({
  ...createCoachLeaveDateSelection(today),
  ...values
})
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

describe('coach leave date selection', () => {
  it('defaults to quick selection without preselecting dates and exposes all four modes', () => {
    expect(createCoachLeaveDateSelection(today)).toEqual({
      mode: 'quick', selectedDates: [], singleDate: today,
      rangeStart: today, rangeEnd: today,
      recurringDays: [], recurringStart: today, recurringEnd: today
    })
    expect(COACH_LEAVE_DATE_MODES).toEqual([
      { value: 'quick', label: '上課日期快選' },
      { value: 'single', label: '單日請假' },
      { value: 'range', label: '連續多日' },
      { value: 'recurring', label: '固定週期' }
    ])
    const first = createCoachLeaveDateSelection(today)
    const second = createCoachLeaveDateSelection(today)
    first.selectedDates.push(today)
    first.recurringDays.push(6)
    expect(second.selectedDates).toEqual([])
    expect(second.recurringDays).toEqual([])
  })

  it('sorts and deduplicates quick dates without merging nonconsecutive dates', () => {
    const state = selection({ selectedDates: ['2026-10-10', today, '2026-10-03', today] })
    expect(buildCoachLeaveDateRecords(state, 'morning', today)).toEqual([
      { start_date: today, end_date: today, time_segment: 'morning' },
      { start_date: '2026-10-03', end_date: '2026-10-03', time_segment: 'morning' },
      { start_date: '2026-10-10', end_date: '2026-10-10', time_segment: 'morning' }
    ])
    expect(state.selectedDates).toEqual(['2026-10-10', today, '2026-10-03', today])
  })

  it('rejects an empty quick selection or any malformed or past selected date', () => {
    expect(() => buildCoachLeaveDateRecords(selection(), 'full_day', today)).toThrow('至少選擇一個請假日期')
    for (const invalid of ['2026-02-30', '2026-13-01', '2026-10-2', '2026-10-03T00:00:00Z', '', ' 2026-10-03']) {
      expect(() => buildCoachLeaveDateRecords(selection({ selectedDates: [today, invalid] }), 'full_day', today)).toThrow('有效的請假日期')
    }
    expect(() => buildCoachLeaveDateRecords(selection({ selectedDates: [today, '2026-10-01'] }), 'full_day', today)).toThrow('今天起')
  })

  it('builds a single date with the requested segment and validates only the active mode', () => {
    expect(buildCoachLeaveDateRecords(selection({ mode: 'single', singleDate: today, rangeStart: '', recurringDays: [] }), 'afternoon', today)).toEqual([
      { start_date: today, end_date: today, time_segment: 'afternoon' }
    ])
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'single', singleDate: '2026-10-01' }), 'afternoon', today)).toThrow('今天起')
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'single', singleDate: '2026-11-31' }), 'afternoon', today)).toThrow('有效的請假日期')
  })

  it('builds a full-day multi-day range and preserves a same-day half-day selection', () => {
    expect(buildCoachLeaveDateRecords(selection({ mode: 'range', rangeEnd: '2026-10-10' }), 'morning', today)).toEqual([
      { start_date: today, end_date: '2026-10-10', time_segment: 'full_day' }
    ])
    expect(buildCoachLeaveDateRecords(selection({ mode: 'range' }), 'afternoon', today)).toEqual([
      { start_date: today, end_date: today, time_segment: 'afternoon' }
    ])
  })

  it('rejects reverse, invalid and past date ranges', () => {
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'range', rangeStart: '2026-10-03' }), 'full_day', today)).toThrow('結束日期不可早於開始日期')
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'range', rangeEnd: '' }), 'full_day', today)).toThrow('有效的結束日期')
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'range', rangeStart: '2026-10-01' }), 'full_day', today)).toThrow('今天起')
  })

  it('expands selected weekdays inclusively into individual half-day records', () => {
    expect(buildCoachLeaveDateRecords(selection({
      mode: 'recurring', recurringDays: [6, 0, 6], recurringStart: '2026-10-03', recurringEnd: '2026-10-11'
    }), 'afternoon', today)).toEqual([
      { start_date: '2026-10-03', end_date: '2026-10-03', time_segment: 'afternoon' },
      { start_date: '2026-10-04', end_date: '2026-10-04', time_segment: 'afternoon' },
      { start_date: '2026-10-10', end_date: '2026-10-10', time_segment: 'afternoon' },
      { start_date: '2026-10-11', end_date: '2026-10-11', time_segment: 'afternoon' }
    ])
  })

  it('handles recurring dates across month, year and leap-day boundaries in UTC', () => {
    expect(buildCoachLeaveDateRecords(selection({
      mode: 'recurring', recurringDays: [4], recurringStart: '2028-02-29', recurringEnd: '2028-03-02'
    }), 'morning', today)).toEqual([
      { start_date: '2028-03-02', end_date: '2028-03-02', time_segment: 'morning' }
    ])
    expect(buildCoachLeaveDateRecords(selection({
      mode: 'recurring', recurringDays: [4, 5], recurringStart: '2026-12-31', recurringEnd: '2027-01-01'
    }), 'full_day', today).map((record) => record.start_date)).toEqual(['2026-12-31', '2027-01-01'])
  })

  it('rejects empty, invalid or unmatched recurring weekdays and malformed recurring ranges', () => {
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'recurring' }), 'full_day', today)).toThrow('至少選擇一個星期')
    for (const day of [-1, 7, 1.5, Number.NaN]) {
      expect(() => buildCoachLeaveDateRecords(selection({ mode: 'recurring', recurringDays: [6, day] }), 'full_day', today)).toThrow('有效的星期')
    }
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'recurring', recurringDays: [6] }), 'full_day', today)).toThrow('沒有符合所選星期')
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'recurring', recurringDays: [6], recurringEnd: 'bad' }), 'full_day', today)).toThrow('有效的結束日期')
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'recurring', recurringDays: [6], recurringStart: '2026-10-03' }), 'full_day', today)).toThrow('結束日期不可早於開始日期')
  })

  it('allows the record limit after deduplication and rejects excess quick records completely', () => {
    const dates = Array.from({ length: MAX_COACH_LEAVE_BATCH_RECORDS }, (_, index) => addDays(today, index))
    expect(buildCoachLeaveDateRecords(selection({ selectedDates: [...dates, dates[0]!] }), 'full_day', today)).toHaveLength(365)
    expect(() => buildCoachLeaveDateRecords(selection({ selectedDates: [...dates, addDays(today, 365)] }), 'full_day', today)).toThrow('最多建立 365 筆')
  })

  it('allows 365 recurring daily records and rejects an overlong range without truncating', () => {
    const weekdays = [0, 1, 2, 3, 4, 5, 6]
    expect(buildCoachLeaveDateRecords(selection({ mode: 'recurring', recurringDays: weekdays, recurringEnd: addDays(today, 364) }), 'morning', today)).toHaveLength(365)
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'recurring', recurringDays: weekdays, recurringEnd: addDays(today, 365) }), 'morning', today)).toThrow('最多 365 天')
  })

  it('bounds inclusive range spans before expansion and still includes the last eligible day', () => {
    const end = addDays(today, MAX_COACH_LEAVE_DATE_RANGE_DAYS - 1)
    expect(buildCoachLeaveDateRecords(selection({ mode: 'range', rangeEnd: end }), 'full_day', today)[0]?.end_date).toBe(end)
    const state = selection({ mode: 'recurring', recurringDays: [new Date(`${end}T00:00:00Z`).getUTCDay()], recurringEnd: end })
    expect(buildCoachLeaveDateRecords(state, 'full_day', today).at(-1)?.end_date).toBe(end)
    for (const mode of ['range', 'recurring'] as const) {
      expect(() => buildCoachLeaveDateRecords(selection({
        mode, rangeEnd: addDays(today, 365), recurringDays: [6], recurringEnd: addDays(today, 365)
      }), 'full_day', today)).toThrow('最多 365 天')
    }
  })

  it('rejects invalid today, unknown modes and invalid segments with actionable messages', () => {
    expect(() => createCoachLeaveDateSelection('2026-02-30')).toThrow('今天的日期無效')
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'single' }), 'full_day', '')).toThrow('今天的日期無效')
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'bad' as CoachLeaveDateSelectionState['mode'] }), 'full_day', today)).toThrow('請假日期方式')
    expect(() => buildCoachLeaveDateRecords(selection({ mode: 'single' }), 'bad' as CoachLeaveTimeSegment, today)).toThrow('請假時段')
  })
})

describe('coach leave class month helpers', () => {
  it('normalizes only valid padded months or exact calendar dates', () => {
    expect(normalizeCoachLeaveMonth(' 2026-10 ')).toBe('2026-10')
    expect(normalizeCoachLeaveMonth('2028-02-29')).toBe('2028-02')
    for (const value of ['2026-1', '2026-13', '2026-02-30', '0000-01', '', null, undefined]) {
      expect(normalizeCoachLeaveMonth(value)).toBeNull()
    }
  })

  it('moves adjacent months across years without carrying the original day', () => {
    expect(getAdjacentCoachLeaveMonth('2026-12', 1)).toBe('2027-01')
    expect(getAdjacentCoachLeaveMonth('2026-01', -1)).toBe('2025-12')
    expect(getAdjacentCoachLeaveMonth('2026-01-31', 1)).toBe('2026-02')
    expect(getAdjacentCoachLeaveMonth('0099-12', 1)).toBe('0100-01')
    expect(getAdjacentCoachLeaveMonth('2026-10', 0)).toBe('2026-10')
    expect(() => getAdjacentCoachLeaveMonth('bad', 1)).toThrow('月份無效')
    expect(() => getAdjacentCoachLeaveMonth('2026-10', 0.5)).toThrow('月份無效')
    expect(() => getAdjacentCoachLeaveMonth('9999-12', 1)).toThrow('超出可選擇範圍')
    expect(() => getAdjacentCoachLeaveMonth('0001-01', -1)).toThrow('超出可選擇範圍')
  })

  it('deduplicates and sorts strict class dates only inside the requested month', () => {
    const dates = ['2026-10-10', '2026-10-03', '2026-10-03', '2026-09-30', '2026-11-01', '2026-10-32', '2026-10-3', null]
    expect(normalizeCoachLeaveClassDates(dates, '2026-10')).toEqual(['2026-10-03', '2026-10-10'])
    expect(normalizeCoachLeaveClassDates(dates, 'bad')).toEqual([])
    expect(normalizeCoachLeaveClassDates(['2028-02-29', '2026-02-29'], '2028-02')).toEqual(['2028-02-29'])
  })
})
