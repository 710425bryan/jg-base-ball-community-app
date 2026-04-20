import dayjs from 'dayjs'
import type { FormRules } from 'element-plus'
import type {
  LeaveMode,
  LeaveRequestDraftRecord,
  LeaveRequestFormState,
  LeaveType
} from '@/types/leaveRequests'

export const LEAVE_TYPE_OPTIONS: LeaveType[] = ['事假', '病假', '公假', '其他']

export const LEAVE_MODE_OPTIONS: LeaveMode[] = ['單日請假', '連續多日', '固定週期']

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
    date_single: formattedToday,
    date_range: [formattedToday, formattedToday],
    recurring_days: [],
    recurring_range: [formattedToday, baseDate.add(1, 'month').format('YYYY-MM-DD')],
    time_range: null,
    reason: ''
  }
}

export const leaveRequestBaseRules: FormRules<LeaveRequestFormState> = {
  leave_type: [{ required: true, message: '請選擇假別', trigger: 'change' }]
}

export const buildLeaveReasonText = (
  reason: string,
  timeRange: LeaveRequestFormState['time_range']
) => {
  const normalizedReason = reason.trim()

  if (timeRange && timeRange.length === 2 && timeRange[0] && timeRange[1]) {
    const timeText = `[時段: ${timeRange[0]} - ${timeRange[1]}]`
    return normalizedReason ? `${timeText}\n${normalizedReason}` : timeText
  }

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

  const finalReason = buildLeaveReasonText(form.reason, form.time_range)

  if (form.leave_mode === '單日請假') {
    if (!form.date_single) {
      throw new Error('請選擇請假日期')
    }

    return [{
      member_id: memberId,
      leave_type: form.leave_type,
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
    return `日期：${form.date_single}`
  }

  if (leaveMode === '連續多日') {
    return `日期：${form.date_range[0]} ~ ${form.date_range[1]}`
  }

  return `週期請假：共 ${recordCount} 天`
}
