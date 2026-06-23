import dayjs, { type Dayjs } from 'dayjs'

export const MONTHLY_FEE_SETTLEMENT_SWITCH_DAY = 25

export const getDefaultMonthlyFeeSettlementMonth = (baseDate: Dayjs = dayjs()) => {
  const date = dayjs(baseDate)

  return date.date() >= MONTHLY_FEE_SETTLEMENT_SWITCH_DAY
    ? date.format('YYYY-MM')
    : date.subtract(1, 'month').format('YYYY-MM')
}

export const getMonthlyFeeTotalSessionsFromTrainingDates = (
  trainingDates: readonly string[] | null | undefined
) => trainingDates?.length ?? 0

export type MonthlyFeeLeaveRequestSource = {
  memberId: string | null | undefined
  startDate: string | null | undefined
  endDate: string | null | undefined
}

const normalizeDateText = (value: string | null | undefined) => {
  const text = String(value || '').trim()
  const match = text.match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : ''
}

const addLeaveDate = (
  leaveDateMap: Map<string, Set<string>>,
  memberId: string | null | undefined,
  date: string
) => {
  const normalizedMemberId = String(memberId || '').trim()
  if (!normalizedMemberId || !date) return

  const dates = leaveDateMap.get(normalizedMemberId) || new Set<string>()
  dates.add(date)
  leaveDateMap.set(normalizedMemberId, dates)
}

export const buildMonthlyFeeLeaveDateMap = ({
  leaveRequests,
  monthStart,
  monthEnd,
  trainingDates
}: {
  leaveRequests: MonthlyFeeLeaveRequestSource[]
  monthStart: string
  monthEnd: string
  trainingDates?: readonly string[] | null
}) => {
  const leaveDateMap = new Map<string, Set<string>>()
  const trainingDateSet = Array.isArray(trainingDates)
    ? new Set(trainingDates.map(normalizeDateText).filter(Boolean))
    : null

  leaveRequests.forEach((leave) => {
    const rawStart = normalizeDateText(leave.startDate)
    const rawEnd = normalizeDateText(leave.endDate || leave.startDate)
    if (!rawStart || !rawEnd) return

    const startDate = rawStart > monthStart ? rawStart : monthStart
    const endDate = rawEnd < monthEnd ? rawEnd : monthEnd
    let cursor = dayjs(startDate)
    const end = dayjs(endDate)

    while (cursor.isValid() && end.isValid() && !cursor.isAfter(end, 'day')) {
      const date = cursor.format('YYYY-MM-DD')
      if (!trainingDateSet || trainingDateSet.has(date)) {
        addLeaveDate(leaveDateMap, leave.memberId, date)
      }
      cursor = cursor.add(1, 'day')
    }
  })

  return new Map(
    Array.from(leaveDateMap.entries()).map(([memberId, dates]) => [
      memberId,
      Array.from(dates).sort()
    ])
  )
}
