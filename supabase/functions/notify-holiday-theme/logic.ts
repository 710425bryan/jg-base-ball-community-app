export const HOLIDAY_THEME_SETTING_KEY = 'holiday_theme_config'

const LEGACY_THEME_ALIASES: Record<string, string> = {
  coaches_birthday: 'coach_dai_birthday',
}

const LEGACY_LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
const SUPPORTED_THEMES = new Set([
  'mothers_day',
  'fathers_day',
  'player_graduation',
  'player_mvp',
  'player_first_hit',
  'coach_dai_birthday',
  'coach_chang_birthday',
  'coach_wu_birthday',
])

const THEME_LABELS: Record<string, string> = {
  mothers_day: '母親節',
  fathers_day: '父親節',
  player_graduation: '球員畢業',
  player_mvp: '球員 MVP',
  player_first_hit: '首安時刻',
  coach_dai_birthday: '戴總教練生日',
  coach_chang_birthday: '張教練生日',
  coach_wu_birthday: '吳教練生日',
}

type HolidayThemeActivity = {
  id: string
  activeTheme: string | null
  scheduleEnabled: boolean
  scheduleStartAt: string | null
  scheduleEndAt: string | null
  title: string
  messages: string[]
  notifyOnStart: boolean
  notificationAutoSentAt: string | null
}

type HolidayThemeConfig = {
  version: number
  activities: HolidayThemeActivity[]
}

const normalizeThemeKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  return LEGACY_THEME_ALIASES[value] || value
}

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const parseHolidayThemeInput = (value: unknown): Record<string, any> | null => {
  if (!value) return null

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  if (typeof value === 'object') {
    return value as Record<string, any>
  }

  return null
}

const cleanMessages = (messages: unknown): string[] => {
  if (!Array.isArray(messages)) return []

  return messages
    .filter((message): message is string => typeof message === 'string')
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 4)
}

export const parseHolidayThemeDateTime = (value: unknown): Date | null => {
  if (!value) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const legacyMatch = trimmed.match(LEGACY_LOCAL_DATE_TIME_RE)
  if (legacyMatch) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = legacyMatch
    const parsed = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - 8,
        Number(minute),
        Number(second)
      )
    )
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const normalizeActivity = (input: Record<string, any>, fallbackId: string): HolidayThemeActivity => {
  const activeThemeKey = normalizeThemeKey(input.activeTheme)
  const activeTheme = SUPPORTED_THEMES.has(activeThemeKey || '') ? activeThemeKey : null

  return {
    id: normalizeText(input.id) || fallbackId,
    activeTheme,
    scheduleEnabled: Boolean(input.scheduleEnabled),
    scheduleStartAt: parseHolidayThemeDateTime(input.scheduleStartAt)?.toISOString() || null,
    scheduleEndAt: parseHolidayThemeDateTime(input.scheduleEndAt)?.toISOString() || null,
    title: normalizeText(input.title),
    messages: cleanMessages(input.messages),
    notifyOnStart: Boolean(input.notifyOnStart),
    notificationAutoSentAt: parseHolidayThemeDateTime(input.notificationAutoSentAt)?.toISOString() || null,
  }
}

export const normalizeHolidayThemeNotificationConfig = (input: unknown): HolidayThemeConfig => {
  const parsed = parseHolidayThemeInput(input)
  if (!parsed) {
    return {
      version: 2,
      activities: [],
    }
  }

  const rawActivities = Array.isArray(parsed.activities)
    ? parsed.activities
    : parsed.activeTheme
      ? [{ ...parsed, notifyOnStart: false }]
      : []

  return {
    version: 2,
    activities: rawActivities
      .map((activity, index) => normalizeActivity(activity, `holiday-theme-activity-${index + 1}`))
      .filter((activity) => activity.activeTheme),
  }
}

export const getDueHolidayThemeActivities = (
  input: unknown,
  now: Date = new Date()
): HolidayThemeActivity[] => {
  const config = normalizeHolidayThemeNotificationConfig(input)

  return config.activities.filter((activity) => {
    if (!activity.activeTheme) return false
    if (!activity.notifyOnStart || !activity.scheduleEnabled) return false
    if (activity.notificationAutoSentAt) return false

    const startAt = parseHolidayThemeDateTime(activity.scheduleStartAt)
    const endAt = parseHolidayThemeDateTime(activity.scheduleEndAt)

    if (!startAt) return false
    if (now < startAt) return false
    if (endAt && now > endAt) return false

    return true
  })
}

export const buildHolidayThemePushPayload = (
  activity: Partial<HolidayThemeActivity>,
  { url = '/' }: { url?: string } = {}
) => {
  const themeKey = normalizeThemeKey(activity.activeTheme) || ''
  const label = THEME_LABELS[themeKey] || '首頁主題'
  const title = normalizeText(activity.title) || `${label} 主題已上線`
  const messages = cleanMessages(activity.messages)

  return {
    title,
    body: messages[0] || '首頁主題已更新，點我查看。',
    url,
  }
}

export const markHolidayThemeActivitiesNotified = (
  input: unknown,
  activityIds: string[],
  sentAt: string = new Date().toISOString()
): HolidayThemeConfig => {
  const idSet = new Set(activityIds.map((id) => String(id)))

  const parsed = parseHolidayThemeInput(input)
  if (parsed && Array.isArray(parsed.activities)) {
    return {
      ...parsed,
      version: 2,
      activities: parsed.activities.map((activity, index) => {
        const baseActivity = parseHolidayThemeInput(activity) || {}
        const normalizedActivity = normalizeActivity(baseActivity, `holiday-theme-activity-${index + 1}`)

        return idSet.has(String(normalizedActivity.id))
          ? {
              ...baseActivity,
              id: normalizedActivity.id,
              notificationAutoSentAt: sentAt,
            }
          : {
              ...baseActivity,
              id: normalizedActivity.id,
            }
      }),
    }
  }

  const config = normalizeHolidayThemeNotificationConfig(input)

  return {
    version: 2,
    activities: config.activities.map((activity) => (
      idSet.has(String(activity.id))
        ? {
            ...activity,
            notificationAutoSentAt: sentAt,
          }
        : activity
    )),
  }
}
