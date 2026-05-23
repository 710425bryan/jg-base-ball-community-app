const TAIPEI_TIME_ZONE = 'Asia/Taipei'
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const

const pad2 = (value: number) => String(value).padStart(2, '0')

const formatDateInTimeZone = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const parts = formatter.formatToParts(date)
  const partMap = new Map(parts.map((part) => [part.type, part.value]))
  return `${partMap.get('year')}-${partMap.get('month')}-${partMap.get('day')}`
}

export const getCurrentTaipeiMonth = (now = new Date()) =>
  formatDateInTimeZone(now, TAIPEI_TIME_ZONE).slice(0, 7)

const parseMonth = (value: string | null | undefined) => {
  const normalized = String(value || '').trim()
  const monthMatch = normalized.match(MONTH_PATTERN)
  if (monthMatch) {
    const year = Number(monthMatch[1])
    const month = Number(monthMatch[2])
    if (month >= 1 && month <= 12) return { year, month }
  }

  const dateMatch = normalized.match(DATE_PATTERN)
  if (dateMatch) {
    const year = Number(dateMatch[1])
    const month = Number(dateMatch[2])
    const day = Number(dateMatch[3])
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    if (month >= 1 && month <= 12 && day >= 1 && day <= maxDay) {
      return { year, month }
    }
  }

  return null
}

const parseDate = (value: string | null | undefined) => {
  const normalized = String(value || '').trim()
  const match = normalized.match(DATE_PATTERN)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (month < 1 || month > 12 || day < 1 || day > maxDay) return null

  return { year, month, day, value: `${year}-${pad2(month)}-${pad2(day)}` }
}

export const normalizeTrainingMonth = (value?: string | null, fallbackMonth = getCurrentTaipeiMonth()) => {
  const parsed = parseMonth(value)
  if (parsed) return `${parsed.year}-${pad2(parsed.month)}`

  const fallback = parseMonth(fallbackMonth) || parseMonth(getCurrentTaipeiMonth())
  return `${fallback!.year}-${pad2(fallback!.month)}`
}

export const getTrainingMonthStartDate = (month?: string | null) =>
  `${normalizeTrainingMonth(month)}-01`

export const getDefaultTrainingMonthDates = (month?: string | null) => {
  const normalized = normalizeTrainingMonth(month)
  const parsed = parseMonth(normalized)!
  const maxDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate()
  const dates: string[] = []

  for (let day = 1; day <= maxDay; day += 1) {
    const date = new Date(Date.UTC(parsed.year, parsed.month - 1, day))
    if (date.getUTCDay() === 6) {
      dates.push(`${normalized}-${pad2(day)}`)
    }
  }

  return dates
}

export const normalizeTrainingMonthDateList = (
  dates: Array<string | null | undefined>,
  month?: string | null
) => {
  const normalizedMonth = month ? normalizeTrainingMonth(month) : null
  const uniqueDates = new Set<string>()

  for (const item of dates) {
    const parsed = parseDate(item)
    if (!parsed) continue
    if (normalizedMonth && parsed.value.slice(0, 7) !== normalizedMonth) continue
    uniqueDates.add(parsed.value)
  }

  return [...uniqueDates].sort((left, right) => left.localeCompare(right))
}

export const diffTrainingMonthDates = (
  previousDates: string[],
  nextDates: string[]
) => {
  const previous = new Set(normalizeTrainingMonthDateList(previousDates))
  const next = new Set(normalizeTrainingMonthDateList(nextDates))

  return {
    addedDates: [...next].filter((date) => !previous.has(date)).sort(),
    removedDates: [...previous].filter((date) => !next.has(date)).sort()
  }
}

export const getTrainingMonthDateWeekday = (dateValue: string) => {
  const parsed = parseDate(dateValue)
  if (!parsed) return ''
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
  return `週${WEEKDAY_LABELS[date.getUTCDay()]}`
}

export const formatTrainingMonthLabel = (month?: string | null) => {
  const normalized = normalizeTrainingMonth(month)
  const [year, monthNumber] = normalized.split('-')
  return `${year} 年 ${Number(monthNumber)} 月`
}

export const formatTrainingMonthDateLabel = (dateValue: string) => {
  const parsed = parseDate(dateValue)
  if (!parsed) return dateValue
  return `${parsed.month}/${parsed.day} ${getTrainingMonthDateWeekday(dateValue)}`
}

export const buildTrainingMonthDateItems = (dates: string[], today?: string | null) => {
  const todayValue = parseDate(today)?.value || formatDateInTimeZone(new Date(), TAIPEI_TIME_ZONE)
  return normalizeTrainingMonthDateList(dates).map((date) => ({
    date,
    weekday: getTrainingMonthDateWeekday(date),
    label: formatTrainingMonthDateLabel(date),
    is_today: date === todayValue,
    is_past: date < todayValue
  }))
}
