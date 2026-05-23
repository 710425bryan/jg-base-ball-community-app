const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const

const parseDate = (value: string | null | undefined) => {
  const normalized = String(value || '').trim()
  const match = normalized.match(DATE_PATTERN)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (month < 1 || month > 12 || day < 1 || day > maxDay) return null

  return { year, month, day, value: normalized }
}

const normalizeTrainingMonthDateList = (
  dates: Array<string | null | undefined>,
  month?: string | null
) => {
  const targetMonth = String(month || '').slice(0, 7)
  const uniqueDates = new Set<string>()

  for (const item of dates) {
    const parsed = parseDate(item)
    if (!parsed) continue
    if (targetMonth && parsed.value.slice(0, 7) !== targetMonth) continue
    uniqueDates.add(parsed.value)
  }

  return [...uniqueDates].sort((left, right) => left.localeCompare(right))
}

const formatTrainingMonthLabel = (monthStart: string) => {
  const parsed = parseDate(monthStart)
  if (!parsed) return monthStart
  return `${parsed.year} 年 ${parsed.month} 月`
}

const formatTrainingMonthDateLabel = (dateValue: string) => {
  const parsed = parseDate(dateValue)
  if (!parsed) return dateValue
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day))
  return `${parsed.month}/${parsed.day} 週${WEEKDAY_LABELS[date.getUTCDay()]}`
}

export type TrainingDateNotificationTarget = {
  user_id: string
  member_id: string
  member_name: string
}

export type TrainingDateNotificationGroup = {
  userId: string
  memberIds: string[]
  memberNames: string[]
}

export type TrainingDateNotificationContext = {
  monthStart: string
  trainingDates: string[]
  addedDates?: string[]
  removedDates?: string[]
  changeKey: string
}

export const groupTrainingDateNotificationTargets = (
  targets: TrainingDateNotificationTarget[]
) => {
  const groups = new Map<string, TrainingDateNotificationGroup>()

  for (const target of targets) {
    if (!target.user_id || !target.member_id) continue
    const group = groups.get(target.user_id) || {
      userId: target.user_id,
      memberIds: [],
      memberNames: []
    }

    if (!group.memberIds.includes(target.member_id)) {
      group.memberIds.push(target.member_id)
      group.memberNames.push(target.member_name || '球員')
    }

    groups.set(target.user_id, group)
  }

  return [...groups.values()].map((group) => ({
    ...group,
    memberNames: [...group.memberNames].sort((left, right) => left.localeCompare(right, 'zh-Hant'))
  }))
}

export const buildTrainingDateNotificationEventKey = (
  group: Pick<TrainingDateNotificationGroup, 'userId'>,
  context: Pick<TrainingDateNotificationContext, 'monthStart' | 'changeKey'>
) => `training_dates:${context.monthStart}:${group.userId}:${context.changeKey || 'changed'}`

export const buildTrainingDateNotificationUrl = (
  context: Pick<TrainingDateNotificationContext, 'monthStart'>
) => `/dashboard?training_month=${encodeURIComponent(context.monthStart.slice(0, 7))}`

export const buildTrainingDateNotificationTitle = (
  context: Pick<TrainingDateNotificationContext, 'monthStart'>
) => `訓練日期異動：${formatTrainingMonthLabel(context.monthStart)}`

export const buildTrainingDateNotificationBody = (context: TrainingDateNotificationContext) => {
  const trainingDates = normalizeTrainingMonthDateList(context.trainingDates, context.monthStart)
  const addedDates = normalizeTrainingMonthDateList(context.addedDates || [], context.monthStart)
  const removedDates = normalizeTrainingMonthDateList(context.removedDates || [], context.monthStart)
  const lines = [
    `本月訓練日：${trainingDates.length > 0 ? trainingDates.map(formatTrainingMonthDateLabel).join('、') : '尚未設定'}`
  ]

  if (addedDates.length > 0) {
    lines.push(`新增：${addedDates.map(formatTrainingMonthDateLabel).join('、')}`)
  }

  if (removedDates.length > 0) {
    lines.push(`取消：${removedDates.map(formatTrainingMonthDateLabel).join('、')}`)
  }

  return lines.join('\n')
}
