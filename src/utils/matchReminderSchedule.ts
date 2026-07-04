import type { MatchRecord } from '@/types/match'

export const MATCH_REMINDER_SCHEDULE_CONFIG_KEY = 'match_reminder_schedule_config'
export const TAIPEI_TIME_ZONE = 'Asia/Taipei'
export const MAX_MATCH_REMINDER_RULES = 10
export const DEFAULT_MATCH_REMINDER_RULE_ID = 'default-1-day-2000'

const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface MatchReminderScheduleRule {
  id: string
  days_before: number
  time: string
  enabled: boolean
}

export interface MatchReminderScheduleConfig {
  version: 1
  enabled: boolean
  rules: MatchReminderScheduleRule[]
}

export interface DueMatchReminderScheduleRule extends MatchReminderScheduleRule {
  scheduled_date: string
  target_date: string
}

export interface MatchReminderHealthCheckOptions {
  windowMinutes?: number
  graceMinutes?: number
}

export type MatchReminderHealthMatch = Pick<MatchRecord, 'id' | 'match_date' | 'match_time' | 'match_name'>

export interface MatchReminderMissingEventAlert {
  rule: DueMatchReminderScheduleRule
  target_date: string
  missing_matches: MatchReminderHealthMatch[]
  missing_count: number
  expected_event_keys: string[]
  missing_event_keys: string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const formatDateTimePartsInTimeZone = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  const parts = formatter.formatToParts(date)
  const partMap = new Map(parts.map((part) => [part.type, part.value]))

  return {
    date: `${partMap.get('year')}-${partMap.get('month')}-${partMap.get('day')}`,
    time: `${partMap.get('hour')}:${partMap.get('minute')}`
  }
}

export const addDaysToDateString = (dateString: string, days: number) => {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))

  return date.toISOString().slice(0, 10)
}

const getTaipeiDateTimeEpoch = (dateString: string, timeString: string) => {
  const [year, month, day] = dateString.split('-').map(Number)
  const [hour, minute] = timeString.split(':').map(Number)

  return Date.UTC(year, month - 1, day, hour - 8, minute)
}

export const getDateTimeInTaipei = (now = new Date()) =>
  formatDateTimePartsInTimeZone(now, TAIPEI_TIME_ZONE)

export const isValidMatchReminderTime = (value: unknown) =>
  typeof value === 'string' && HH_MM_PATTERN.test(value.trim())

export const createDefaultMatchReminderScheduleConfig = (): MatchReminderScheduleConfig => ({
  version: 1,
  enabled: true,
  rules: [
    {
      id: DEFAULT_MATCH_REMINDER_RULE_ID,
      days_before: 1,
      time: '20:00',
      enabled: true
    }
  ]
})

const normalizeDaysBefore = (value: unknown) => {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 30) return null
  return parsed
}

const normalizeRuleId = (value: unknown, daysBefore: number, time: string, index: number) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || `rule-${daysBefore}-${time.replace(':', '')}-${index + 1}`
}

export const normalizeMatchReminderScheduleConfig = (input: unknown): MatchReminderScheduleConfig => {
  const defaultConfig = createDefaultMatchReminderScheduleConfig()
  if (!isRecord(input)) return defaultConfig

  const rawRules = Array.isArray(input.rules) ? input.rules : defaultConfig.rules
  const rules: MatchReminderScheduleRule[] = []
  const seenRuleKeys = new Set<string>()

  for (const [index, rawRule] of rawRules.entries()) {
    if (rules.length >= MAX_MATCH_REMINDER_RULES) break
    if (!isRecord(rawRule)) continue

    const daysBefore = normalizeDaysBefore(rawRule.days_before)
    const time = typeof rawRule.time === 'string' ? rawRule.time.trim() : ''
    if (daysBefore === null || !isValidMatchReminderTime(time)) continue

    const ruleKey = `${daysBefore}:${time}`
    if (seenRuleKeys.has(ruleKey)) continue
    seenRuleKeys.add(ruleKey)

    rules.push({
      id: normalizeRuleId(rawRule.id, daysBefore, time, index),
      days_before: daysBefore,
      time,
      enabled: rawRule.enabled !== false
    })
  }

  return {
    version: 1,
    enabled: input.enabled !== false,
    rules: rules.length > 0 ? rules : defaultConfig.rules
  }
}

export const validateMatchReminderScheduleConfig = (input: unknown) => {
  const errors: string[] = []

  if (!isRecord(input)) {
    return ['提醒排程設定格式不正確']
  }

  if (typeof input.enabled !== 'boolean') {
    errors.push('排程啟用狀態格式不正確')
  }

  if (!Array.isArray(input.rules)) {
    errors.push('提醒規則格式不正確')
    return errors
  }

  if (input.rules.length === 0) {
    errors.push('至少需要保留一組提醒規則')
  }

  if (input.rules.length > MAX_MATCH_REMINDER_RULES) {
    errors.push(`提醒規則最多只能設定 ${MAX_MATCH_REMINDER_RULES} 組`)
  }

  const seenRuleKeys = new Set<string>()
  for (const [index, rawRule] of input.rules.entries()) {
    const ruleNumber = index + 1
    if (!isRecord(rawRule)) {
      errors.push(`第 ${ruleNumber} 組提醒規則格式不正確`)
      continue
    }

    const daysBefore = normalizeDaysBefore(rawRule.days_before)
    const time = typeof rawRule.time === 'string' ? rawRule.time.trim() : ''

    if (daysBefore === null) {
      errors.push(`第 ${ruleNumber} 組提醒的賽前天數需介於 0 到 30 天`)
    }

    if (!isValidMatchReminderTime(time)) {
      errors.push(`第 ${ruleNumber} 組提醒時間需為 HH:mm 格式`)
    }

    if (typeof rawRule.enabled !== 'boolean') {
      errors.push(`第 ${ruleNumber} 組提醒啟用狀態格式不正確`)
    }

    if (daysBefore !== null && isValidMatchReminderTime(time)) {
      const ruleKey = `${daysBefore}:${time}`
      if (seenRuleKeys.has(ruleKey)) {
        errors.push(`第 ${ruleNumber} 組提醒與其他規則重複`)
      }
      seenRuleKeys.add(ruleKey)
    }
  }

  return errors
}

export const getDueMatchReminderRules = (
  input: unknown,
  now = new Date()
): DueMatchReminderScheduleRule[] => {
  const config = normalizeMatchReminderScheduleConfig(input)
  if (!config.enabled) return []

  const taipeiNow = getDateTimeInTaipei(now)
  return config.rules
    .filter((rule) => rule.enabled && rule.time === taipeiNow.time)
    .map((rule) => ({
      ...rule,
      scheduled_date: taipeiNow.date,
      target_date: addDaysToDateString(taipeiNow.date, rule.days_before)
    }))
}

export const getRecentDueMatchReminderRules = (
  input: unknown,
  now = new Date(),
  options: MatchReminderHealthCheckOptions = {}
): DueMatchReminderScheduleRule[] => {
  const config = normalizeMatchReminderScheduleConfig(input)
  if (!config.enabled) return []

  const windowMinutes = Math.max(1, Math.floor(options.windowMinutes ?? 30))
  const graceMinutes = Math.max(0, Math.floor(options.graceMinutes ?? 3))
  const taipeiNow = getDateTimeInTaipei(now)
  const nowEpoch = getTaipeiDateTimeEpoch(taipeiNow.date, taipeiNow.time)
  const candidates = [
    taipeiNow.date,
    addDaysToDateString(taipeiNow.date, -1)
  ]

  return config.rules
    .filter((rule) => rule.enabled)
    .flatMap((rule) => candidates.map((scheduledDate) => {
      const scheduledEpoch = getTaipeiDateTimeEpoch(scheduledDate, rule.time)
      const diffMinutes = Math.floor((nowEpoch - scheduledEpoch) / 60_000)

      if (diffMinutes < graceMinutes || diffMinutes > windowMinutes) return null

      return {
        ...rule,
        scheduled_date: scheduledDate,
        target_date: addDaysToDateString(scheduledDate, rule.days_before)
      }
    }))
    .filter((rule): rule is DueMatchReminderScheduleRule => Boolean(rule))
}

export const buildMatchReminderScheduleEventKey = (
  match: Pick<MatchRecord, 'id'>,
  rule: Pick<DueMatchReminderScheduleRule, 'id' | 'scheduled_date' | 'time'>
) => `match_reminder:${match.id}:${rule.id}:${rule.scheduled_date}:${rule.time}`

export const buildMatchReminderHealthEventKey = (
  kind: string,
  rule: Pick<DueMatchReminderScheduleRule, 'id' | 'scheduled_date' | 'time'>,
  adminUserId: string
) => `match_reminder_health:${kind}:${rule.id}:${rule.scheduled_date}:${rule.time}:${adminUserId}`

export const findMissingMatchReminderEvents = (
  rules: DueMatchReminderScheduleRule[],
  matchesByTargetDate: Record<string, MatchReminderHealthMatch[]>,
  existingEventKeys: Iterable<string>
): MatchReminderMissingEventAlert[] => {
  const existingKeys = new Set(existingEventKeys)

  return rules
    .map((rule) => {
      const matches = matchesByTargetDate[rule.target_date] || []
      const missingMatches = matches.filter((match) =>
        !existingKeys.has(buildMatchReminderScheduleEventKey(match, rule))
      )

      if (matches.length === 0 || missingMatches.length === 0) return null

      return {
        rule,
        target_date: rule.target_date,
        missing_matches: missingMatches,
        missing_count: missingMatches.length,
        expected_event_keys: matches.map((match) => buildMatchReminderScheduleEventKey(match, rule)),
        missing_event_keys: missingMatches.map((match) => buildMatchReminderScheduleEventKey(match, rule))
      }
    })
    .filter((alert): alert is MatchReminderMissingEventAlert => Boolean(alert))
}
