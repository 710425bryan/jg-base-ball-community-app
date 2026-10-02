import type {
  CoachLeaveDateRecord,
  CoachLeaveDateSelectionState,
  CoachLeaveDateMode
} from '@/types/coachLeaveDateSelection'
import type { CoachLeaveTimeSegment } from '@/types/coachLeaveRequest'

export const MAX_COACH_LEAVE_BATCH_RECORDS = 365
export const MAX_COACH_LEAVE_DATE_RANGE_DAYS = 365
export const COACH_LEAVE_DATE_MODES: { value: CoachLeaveDateMode; label: string }[] = [
  { value: 'quick', label: '上課日期快選' },
  { value: 'single', label: '單日請假' },
  { value: 'range', label: '連續多日' },
  { value: 'recurring', label: '固定週期' }
]

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000
const TIME_SEGMENTS: CoachLeaveTimeSegment[] = ['full_day', 'morning', 'afternoon']

const parseDate = (value: unknown) => {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

const requireDate = (value: unknown, label: string, today: string) => {
  const date = parseDate(value)
  if (!date) throw new Error(`請選擇有效的${label}。`)
  if ((value as string) < today) throw new Error('只可選擇今天起的請假日期。')
  return date
}

const requireRange = (start: string, end: string, today: string) => {
  const startDate = requireDate(start, '開始日期', today)
  const endDate = requireDate(end, '結束日期', today)
  if (endDate < startDate) throw new Error('結束日期不可早於開始日期。')
  const days = (endDate.getTime() - startDate.getTime()) / DAY_MILLISECONDS + 1
  if (days > MAX_COACH_LEAVE_DATE_RANGE_DAYS) {
    throw new Error(`一次日期範圍最多 ${MAX_COACH_LEAVE_DATE_RANGE_DAYS} 天，請分批建立。`)
  }
  return { startDate, endDate }
}

const requireRecordLimit = (records: CoachLeaveDateRecord[]) => {
  if (records.length > MAX_COACH_LEAVE_BATCH_RECORDS) {
    throw new Error(`一次最多建立 ${MAX_COACH_LEAVE_BATCH_RECORDS} 筆假單，請減少日期或分批建立。`)
  }
  return records
}

const singleRecord = (date: string, segment: CoachLeaveTimeSegment): CoachLeaveDateRecord => ({
  start_date: date,
  end_date: date,
  time_segment: segment
})

export const createCoachLeaveDateSelection = (today: string): CoachLeaveDateSelectionState => {
  if (!parseDate(today)) throw new Error('今天的日期無效，請重新整理後再試。')
  return {
    mode: 'quick',
    selectedDates: [],
    singleDate: today,
    rangeStart: today,
    rangeEnd: today,
    recurringDays: [],
    recurringStart: today,
    recurringEnd: today
  }
}

export const buildCoachLeaveDateRecords = (
  selection: CoachLeaveDateSelectionState,
  timeSegment: CoachLeaveTimeSegment,
  today: string
): CoachLeaveDateRecord[] => {
  if (!parseDate(today)) throw new Error('今天的日期無效，請重新整理後再試。')
  if (!TIME_SEGMENTS.includes(timeSegment)) throw new Error('請選擇請假時段。')

  switch (selection.mode) {
    case 'quick': {
      if (!Array.isArray(selection.selectedDates) || selection.selectedDates.length === 0) {
        throw new Error('請至少選擇一個請假日期。')
      }
      for (const date of selection.selectedDates) requireDate(date, '請假日期', today)
      const dates = [...new Set(selection.selectedDates)].sort()
      return requireRecordLimit(dates.map((date) => singleRecord(date, timeSegment)))
    }
    case 'single':
      requireDate(selection.singleDate, '請假日期', today)
      return [singleRecord(selection.singleDate, timeSegment)]
    case 'range':
      requireRange(selection.rangeStart, selection.rangeEnd, today)
      return [{
        start_date: selection.rangeStart,
        end_date: selection.rangeEnd,
        time_segment: selection.rangeStart === selection.rangeEnd ? timeSegment : 'full_day'
      }]
    case 'recurring': {
      if (!Array.isArray(selection.recurringDays) || selection.recurringDays.length === 0) {
        throw new Error('請至少選擇一個星期。')
      }
      if (selection.recurringDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw new Error('請選擇有效的星期（星期日至星期六）。')
      }
      const weekdays = new Set(selection.recurringDays)
      const { startDate, endDate } = requireRange(selection.recurringStart, selection.recurringEnd, today)
      const records: CoachLeaveDateRecord[] = []
      for (let time = startDate.getTime(); time <= endDate.getTime(); time += DAY_MILLISECONDS) {
        const date = new Date(time)
        if (weekdays.has(date.getUTCDay())) {
          records.push(singleRecord(date.toISOString().slice(0, 10), timeSegment))
        }
      }
      if (records.length === 0) throw new Error('日期範圍內沒有符合所選星期的日期。')
      return requireRecordLimit(records)
    }
    default:
      throw new Error('請選擇請假日期方式。')
  }
}

export const normalizeCoachLeaveMonth = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const month = value.trim()
  if (/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) return month
  return parseDate(month) ? month.slice(0, 7) : null
}

export const getAdjacentCoachLeaveMonth = (month: string, offset: number): string => {
  const normalizedMonth = normalizeCoachLeaveMonth(month)
  if (!normalizedMonth || !Number.isInteger(offset)) throw new Error('月份無效，請重新選擇。')
  const date = new Date(`${normalizedMonth}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new Error('月份超出可選擇範圍。')
  }
  return date.toISOString().slice(0, 7)
}

export const normalizeCoachLeaveClassDates = (dates: readonly unknown[], month: string): string[] => {
  const normalizedMonth = normalizeCoachLeaveMonth(month)
  if (!normalizedMonth || !Array.isArray(dates)) return []
  return [...new Set(dates.filter((date): date is string =>
    !!parseDate(date) && (date as string).slice(0, 7) === normalizedMonth
  ))].sort()
}
