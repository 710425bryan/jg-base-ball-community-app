import dayjs from 'dayjs'
import type { FormRules } from 'element-plus'
import type {
  LeaveTimeSegment,
  LeaveMode,
  LeaveRequestDraftRecord,
  LeaveRequestFormState,
  LeaveType
} from '@/types/leaveRequests'

export const LEAVE_TYPE_OPTIONS: LeaveType[] = ['事假', '病假', '公假', '其他']

export const LEAVE_MODE_OPTIONS: LeaveMode[] = ['單日請假', '連續多日', '固定週期']

export const LEAVE_TIME_SEGMENT_OPTIONS: Array<{ label: string; value: LeaveTimeSegment }> = [
  { label: '全日', value: 'full_day' },
  { label: '上午', value: 'morning' },
  { label: '下午', value: 'afternoon' }
]

export const LEAVE_WEEKDAY_OPTIONS = [
  { label: '一', value: 1 },
  { label: '二', value: 2 },
  { label: '三', value: 3 },
  { label: '四', value: 4 },
  { label: '五', value: 5 },
  { label: '六', value: 6 },
  { label: '日', value: 0 }
] as const

export const createDefaultLeaveRequestFormState = (baseDate = dayjs()): LeaveRequestFormState => {
  const formattedToday = baseDate.format('YYYY-MM-DD')

  return {
    leave_type: '事假',
    leave_mode: '單日請假',
    leave_time_segment: 'full_day',
    date_single: formattedToday,
    date_range: [formattedToday, formattedToday],
    recurring_days: [],
    recurring_range: [formattedToday, baseDate.add(1, 'month').format('YYYY-MM-DD')],
    reason: ''
  }
}

export const leaveRequestBaseRules: FormRules<LeaveRequestFormState> = {
  leave_type: [{ required: true, message: '請選擇假別', trigger: 'change' }]
}

const normalizeDateValue = (value: string | null | undefined) => {
  const normalized = String(value || '').trim()
  const parsed = dayjs(normalized)
  return parsed.isValid() && parsed.format('YYYY-MM-DD') === normalized ? normalized : null
}

const collectDatesInRange = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  maxIterations: number
) => {
  const startValue = normalizeDateValue(startDate)
  const endValue = normalizeDateValue(endDate)
  if (!startValue || !endValue) {
    return []
  }

  let currentDate = dayjs(startValue)
  const finalDate = dayjs(endValue)
  if (finalDate.isBefore(currentDate, 'day')) {
    return []
  }

  const dates: string[] = []
  let loops = 0
  while ((currentDate.isBefore(finalDate) || currentDate.isSame(finalDate, 'day')) && loops < maxIterations) {
    dates.push(currentDate.format('YYYY-MM-DD'))
    currentDate = currentDate.add(1, 'day')
    loops += 1
  }

  return dates
}

const dedupeSortedDates = (dates: string[]) => [...new Set(dates)].sort((left, right) => left.localeCompare(right))

export const normalizeLeaveTimeSegment = (value: unknown): LeaveTimeSegment => {
  const normalized = String(value || '').trim()
  return normalized === 'morning' || normalized === 'afternoon' ? normalized : 'full_day'
}

export const getLeaveTimeSegmentLabel = (value: unknown) => {
  switch (normalizeLeaveTimeSegment(value)) {
    case 'morning':
      return '上午'
    case 'afternoon':
      return '下午'
    default:
      return '全日'
  }
}

export const collectLeaveRequestDates = (
  form: LeaveRequestFormState,
  maxIterations = 365
) => {
  if (form.leave_mode === '單日請假') {
    const date = normalizeDateValue(form.date_single)
    return date ? [date] : []
  }

  if (form.leave_mode === '連續多日') {
    return collectDatesInRange(form.date_range?.[0], form.date_range?.[1], maxIterations)
  }

  if (!form.recurring_days || form.recurring_days.length === 0) {
    return []
  }

  const rangeDates = collectDatesInRange(form.recurring_range?.[0], form.recurring_range?.[1], maxIterations)
  return dedupeSortedDates(rangeDates.filter((date) => form.recurring_days.includes(dayjs(date).day())))
}

export const findNonTrainingLeaveDates = (
  leaveDates: string[],
  trainingDates: string[]
) => {
  const trainingDateSet = new Set(trainingDates.map(normalizeDateValue).filter((date): date is string => Boolean(date)))
  return dedupeSortedDates(
    leaveDates
      .map(normalizeDateValue)
      .filter((date): date is string => {
        if (!date) return false
        return !trainingDateSet.has(date)
      })
  )
}

export const buildLeaveReasonText = (reason: string) => {
  const normalizedReason = reason.trim()
  return normalizedReason || null
}

export const buildLeaveRequestRecords = ({
  memberId,
  form,
  maxRecurringIterations = 365
}: {
  memberId: string
  form: LeaveRequestFormState
  maxRecurringIterations?: number
}): LeaveRequestDraftRecord[] => {
  if (!memberId.trim()) {
    throw new Error('請選擇請假人員')
  }

  const finalReason = buildLeaveReasonText(form.reason)

  if (form.leave_mode === '單日請假') {
    if (!form.date_single) {
      throw new Error('請選擇請假日期')
    }

    return [{
      member_id: memberId,
      leave_type: form.leave_type,
      leave_time_segment: normalizeLeaveTimeSegment(form.leave_time_segment),
      start_date: form.date_single,
      end_date: form.date_single,
      reason: finalReason
    }]
  }

  if (form.leave_mode === '連續多日') {
    if (!form.date_range || form.date_range.length !== 2 || !form.date_range[0] || !form.date_range[1]) {
      throw new Error('請選擇日期區間')
    }

    return [{
      member_id: memberId,
      leave_type: form.leave_type,
      leave_time_segment: 'full_day',
      start_date: form.date_range[0],
      end_date: form.date_range[1],
      reason: finalReason
    }]
  }

  if (!form.recurring_range || form.recurring_range.length !== 2 || !form.recurring_range[0] || !form.recurring_range[1]) {
    throw new Error('請選擇生效期限')
  }

  if (!form.recurring_days || form.recurring_days.length === 0) {
    throw new Error('請至少選擇一天固定星期')
  }

  const records: LeaveRequestDraftRecord[] = []
  let currentDate = dayjs(form.recurring_range[0])
  const endDate = dayjs(form.recurring_range[1])
  let loops = 0

  while ((currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) && loops < maxRecurringIterations) {
    if (form.recurring_days.includes(currentDate.day())) {
      records.push({
        member_id: memberId,
        leave_type: form.leave_type,
        leave_time_segment: 'full_day',
        start_date: currentDate.format('YYYY-MM-DD'),
        end_date: currentDate.format('YYYY-MM-DD'),
        reason: finalReason
      })
    }

    currentDate = currentDate.add(1, 'day')
    loops += 1
  }

  if (records.length === 0) {
    throw new Error('所選期限內沒有符合該星期的日期')
  }

  return records
}

export const buildLeaveNotificationDateLabel = ({
  leaveMode,
  form,
  recordCount
}: {
  leaveMode: LeaveMode
  form: LeaveRequestFormState
  recordCount: number
}) => {
  if (leaveMode === '單日請假') {
    return `日期：${form.date_single}（${getLeaveTimeSegmentLabel(form.leave_time_segment)}）`
  }

  if (leaveMode === '連續多日') {
    return `日期：${form.date_range[0]} ~ ${form.date_range[1]}`
  }

  return `週期請假：共 ${recordCount} 天`
}
