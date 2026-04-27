import { computed, onMounted, onUnmounted, ref } from 'vue'

import { supabase } from '@/services/supabase'

type AnyRecord = Record<string, any>
type NullableString = string | null

export const HOLIDAY_THEME_SETTING_KEY = 'holiday_theme_config'
export const HOLIDAY_THEME_VERSION = 2
export const HOLIDAY_THEME_SCHEDULE_REFRESH_MS = 30000
export const HOLIDAY_THEME_MAX_MESSAGES = 4

const LEGACY_THEME_ALIASES: Record<string, string> = {
  coaches_birthday: 'coach_dai_birthday',
}

const LEGACY_MOTION_PRESET_ALIASES: Record<string, string> = {
  fireworks_burst: 'fireworks_gold',
}

const TAIPEI_OFFSET_MINUTES = 8 * 60
const TAIPEI_OFFSET_MS = TAIPEI_OFFSET_MINUTES * 60 * 1000
const LEGACY_LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/

const normalizeThemeKey = (value: unknown): NullableString => {
  if (typeof value !== 'string') return null
  return LEGACY_THEME_ALIASES[value] || value
}

const normalizeMotionPresetKey = (value: unknown): NullableString => {
  if (typeof value !== 'string') return null
  return LEGACY_MOTION_PRESET_ALIASES[value] || value
}

const normalizeString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const resolvePresetValue = (value: unknown, context: AnyRecord, fallback: unknown) => {
  if (typeof value === 'function') return value(context)
  return value ?? fallback
}

const createHolidayThemeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `holiday-theme-${crypto.randomUUID()}`
  }

  return `holiday-theme-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const HOLIDAY_THEME_MOTION_OPTIONS = Object.freeze([
  { value: 'soft_petals', label: '花瓣柔光' },
  { value: 'gentle_glow', label: '微光漂浮' },
  { value: 'heart_bokeh', label: '愛心光斑' },
  { value: 'sakura_blossom', label: '櫻花飛舞' },
  { value: 'snowfall_drift', label: '雪花飄落' },
  { value: 'fireworks_burst', label: '煙火綻放' },
  { value: 'starlight_confetti', label: '星彩紙花' },
])

export const HOLIDAY_THEME_MOTION_LABELS = Object.freeze({
  ...Object.fromEntries(HOLIDAY_THEME_MOTION_OPTIONS.map(({ value, label }) => [value, label])),
  fireworks_burst: '金色煙火',
  fireworks_gold: '金色煙火',
  fireworks_rainbow: '彩色煙火',
  fireworks_champion: '冠軍煙火',
})

export const HOLIDAY_THEME_MOTION_PICKER_OPTIONS = Object.freeze([
  { value: 'soft_petals', label: '花瓣柔光' },
  { value: 'gentle_glow', label: '微光漂浮' },
  { value: 'heart_bokeh', label: '愛心光斑' },
  { value: 'sakura_blossom', label: '櫻花飛舞' },
  { value: 'snowfall_drift', label: '雪花飄落' },
  { value: 'fireworks_gold', label: '金色煙火' },
  { value: 'fireworks_rainbow', label: '彩色煙火' },
  { value: 'fireworks_champion', label: '冠軍煙火' },
  { value: 'starlight_confetti', label: '星彩紙花' },
])

export const HOLIDAY_THEME_PRESETS: AnyRecord = {
  mothers_day: {
    label: '母親節',
    badgeText: "MOTHER'S DAY",
    defaultTitle: '把今天最溫柔的掌聲，送給每一位媽媽',
    defaultMessages: [
      '謝謝每一位媽媽，用愛守護孩子的每一次揮棒。',
      '願所有媽媽都平安健康，也別忘了今天好好被照顧。',
      '母親節快樂，願溫柔與力量都回到妳的身上。',
    ],
    defaultMotionPreset: 'soft_petals',
    palette: {
      accent: '#f472b6',
      accentSoft: '#fbcfe8',
      highlight: '#f59e0b',
      ribbonFrom: '#ec4899',
      ribbonTo: '#be185d',
      cardFrom: 'rgba(255, 255, 255, 0.18)',
      cardTo: 'rgba(255, 240, 246, 0.12)',
      border: 'rgba(252, 231, 243, 0.48)',
      glow: 'rgba(244, 114, 182, 0.26)',
      text: '#fff7fb',
      muted: '#ffe4ef',
      decorationPrimary: 'rgba(251, 207, 232, 0.9)',
      decorationSecondary: 'rgba(245, 158, 11, 0.38)',
      decorationTertiary: 'rgba(255, 255, 255, 0.75)',
    },
  },
  fathers_day: {
    label: '父親節',
    badgeText: "FATHER'S DAY",
    defaultTitle: '把今天最堅定的掌聲，送給每一位爸爸',
    defaultMessages: [
      '謝謝每一位爸爸，默默陪著孩子走過每一次練習與比賽。',
      '願所有爸爸都平安健康，也記得給自己一點喘息與鼓勵。',
      '父親節快樂，願辛苦與付出都被好好看見。',
    ],
    defaultMotionPreset: 'gentle_glow',
    palette: {
      accent: '#60a5fa',
      accentSoft: '#bae6fd',
      highlight: '#fbbf24',
      ribbonFrom: '#1d4ed8',
      ribbonTo: '#0f766e',
      cardFrom: 'rgba(15, 23, 42, 0.28)',
      cardTo: 'rgba(14, 116, 144, 0.12)',
      border: 'rgba(191, 219, 254, 0.34)',
      glow: 'rgba(96, 165, 250, 0.22)',
      text: '#eff6ff',
      muted: '#dbeafe',
      decorationPrimary: 'rgba(125, 211, 252, 0.75)',
      decorationSecondary: 'rgba(251, 191, 36, 0.42)',
      decorationTertiary: 'rgba(255, 255, 255, 0.42)',
    },
  },
  player_graduation: {
    label: '球員畢業',
    badgeText: 'GRADUATION DAY',
    defaultTitle: '把今天最閃亮的掌聲，送給畢業的球員們',
    defaultMessages: [
      '謝謝每一位畢業球員，陪我們一起寫下最熱血的青春篇章。',
      '畢業不是結束，而是帶著勇氣與紀律走向下一段旅程。',
      '願你們帶著在球場上學會的信念，繼續迎向每一場挑戰。',
    ],
    defaultMotionPreset: 'gentle_glow',
    palette: {
      accent: '#818cf8',
      accentSoft: '#c7d2fe',
      highlight: '#f59e0b',
      ribbonFrom: '#4338ca',
      ribbonTo: '#1d4ed8',
      cardFrom: 'rgba(30, 41, 59, 0.3)',
      cardTo: 'rgba(59, 130, 246, 0.12)',
      border: 'rgba(199, 210, 254, 0.36)',
      glow: 'rgba(129, 140, 248, 0.24)',
      text: '#eef2ff',
      muted: '#dbeafe',
      decorationPrimary: 'rgba(224, 231, 255, 0.82)',
      decorationSecondary: 'rgba(245, 158, 11, 0.42)',
      decorationTertiary: 'rgba(255, 255, 255, 0.52)',
    },
  },
  coach_dai_birthday: {
    label: '戴總教練生日',
    badgeText: 'COACH DAI',
    defaultTitle: '把今天最熱烈的掌聲，送給戴總教練',
    defaultMessages: [
      '謝謝戴總教練一直用熱情與堅持，帶著球隊持續向前。',
      '願新的一歲身體健康、心想事成，每一天都充滿好球與好事。',
      '生日快樂，願球場上的榮耀與生活裡的喜悅都如約而至。',
    ],
    defaultMotionPreset: 'gentle_glow',
    palette: {
      accent: '#f97316',
      accentSoft: '#fdba74',
      highlight: '#facc15',
      ribbonFrom: '#ea580c',
      ribbonTo: '#c2410c',
      cardFrom: 'rgba(120, 53, 15, 0.24)',
      cardTo: 'rgba(234, 88, 12, 0.12)',
      border: 'rgba(254, 215, 170, 0.38)',
      glow: 'rgba(249, 115, 22, 0.24)',
      text: '#fff7ed',
      muted: '#ffedd5',
      decorationPrimary: 'rgba(254, 215, 170, 0.84)',
      decorationSecondary: 'rgba(250, 204, 21, 0.4)',
      decorationTertiary: 'rgba(255, 255, 255, 0.58)',
    },
  },
  coach_chang_birthday: {
    label: '張教練生日',
    badgeText: 'COACH CHANG',
    defaultTitle: '把今天最真誠的祝福，送給張教練',
    defaultMessages: [
      '謝謝張教練一直用耐心與細節，幫助每位球員穩穩成長。',
      '願新的一歲健康順心、平安喜樂，每一場努力都換來好消息。',
      '生日快樂，願你在球場內外都收穫滿滿的成就與快樂。',
    ],
    defaultMotionPreset: 'soft_petals',
    palette: {
      accent: '#22c55e',
      accentSoft: '#86efac',
      highlight: '#facc15',
      ribbonFrom: '#16a34a',
      ribbonTo: '#15803d',
      cardFrom: 'rgba(20, 83, 45, 0.22)',
      cardTo: 'rgba(34, 197, 94, 0.1)',
      border: 'rgba(187, 247, 208, 0.34)',
      glow: 'rgba(34, 197, 94, 0.24)',
      text: '#f0fdf4',
      muted: '#dcfce7',
      decorationPrimary: 'rgba(187, 247, 208, 0.82)',
      decorationSecondary: 'rgba(250, 204, 21, 0.36)',
      decorationTertiary: 'rgba(255, 255, 255, 0.5)',
    },
  },
  coach_wu_birthday: {
    label: '吳教練生日',
    badgeText: 'COACH WU',
    defaultTitle: '把今天最溫暖的祝福，送給吳教練',
    defaultMessages: [
      '謝謝吳教練一直用鼓勵與陪伴，讓球隊在每一天都更有力量。',
      '願新的一歲身體健康、生活順利，每一份付出都被溫柔回應。',
      '生日快樂，願你在場上場下都被幸福與掌聲圍繞。',
    ],
    defaultMotionPreset: 'heart_bokeh',
    palette: {
      accent: '#a855f7',
      accentSoft: '#d8b4fe',
      highlight: '#fb7185',
      ribbonFrom: '#9333ea',
      ribbonTo: '#c026d3',
      cardFrom: 'rgba(88, 28, 135, 0.22)',
      cardTo: 'rgba(168, 85, 247, 0.1)',
      border: 'rgba(233, 213, 255, 0.34)',
      glow: 'rgba(168, 85, 247, 0.24)',
      text: '#faf5ff',
      muted: '#f3e8ff',
      decorationPrimary: 'rgba(233, 213, 255, 0.82)',
      decorationSecondary: 'rgba(251, 113, 133, 0.34)',
      decorationTertiary: 'rgba(255, 255, 255, 0.54)',
    },
  },
  player_mvp: {
    label: '球員 MVP',
    badgeText: 'PLAYER MVP',
    defaultTitle: ({ playerName }: { playerName?: string }) => `${playerName || '本週 MVP'} 榮耀時刻`,
    defaultMessages: ({ playerName }: { playerName?: string }) => [
      `${playerName || '這位球員'}用穩定又關鍵的表現，拿下今天最亮眼的 MVP。`,
      '謝謝你把努力化成實際表現，也讓團隊看見堅持的價值。',
      '繼續帶著這份自信與專注，在下一場比賽發光發熱。',
    ],
    defaultMotionPreset: 'gentle_glow',
    palette: {
      accent: '#f59e0b',
      accentSoft: '#fde68a',
      highlight: '#ef4444',
      ribbonFrom: '#d97706',
      ribbonTo: '#b45309',
      cardFrom: 'rgba(120, 53, 15, 0.26)',
      cardTo: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(253, 230, 138, 0.34)',
      glow: 'rgba(245, 158, 11, 0.26)',
      text: '#fff7ed',
      muted: '#ffedd5',
      decorationPrimary: 'rgba(255, 237, 213, 0.84)',
      decorationSecondary: 'rgba(239, 68, 68, 0.34)',
      decorationTertiary: 'rgba(255, 255, 255, 0.56)',
    },
  },
  player_first_hit: {
    label: '首安時刻',
    badgeText: 'FIRST HIT',
    defaultTitle: ({ playerName }: { playerName?: string }) => `${playerName || '今日球員'} 首安開張`,
    defaultMessages: ({ playerName }: { playerName?: string }) => [
      `${playerName || '這位球員'}敲出精彩首安，替今天留下值得記住的一球。`,
      '每一次突破都很珍貴，謝謝你把平常的努力兌現成上場的成果。',
      '願這支首安成為新的起點，接下來繼續一棒一棒穩穩推進。',
    ],
    defaultMotionPreset: 'soft_petals',
    palette: {
      accent: '#14b8a6',
      accentSoft: '#99f6e4',
      highlight: '#3b82f6',
      ribbonFrom: '#0f766e',
      ribbonTo: '#0ea5e9',
      cardFrom: 'rgba(15, 118, 110, 0.24)',
      cardTo: 'rgba(14, 165, 233, 0.12)',
      border: 'rgba(153, 246, 228, 0.34)',
      glow: 'rgba(20, 184, 166, 0.24)',
      text: '#f0fdfa',
      muted: '#ccfbf1',
      decorationPrimary: 'rgba(204, 251, 241, 0.82)',
      decorationSecondary: 'rgba(59, 130, 246, 0.32)',
      decorationTertiary: 'rgba(255, 255, 255, 0.54)',
    },
  },
}

const SUPPORTED_THEMES = new Set(Object.keys(HOLIDAY_THEME_PRESETS))
const SUPPORTED_MOTION_PRESETS = new Set([
  ...HOLIDAY_THEME_MOTION_OPTIONS.map((item) => item.value),
  ...HOLIDAY_THEME_MOTION_PICKER_OPTIONS.map((item) => item.value),
])
const PLAYER_THEME_KEYS = new Set(['player_mvp', 'player_first_hit'])

const DEFAULT_ACTIVITY_STATE: AnyRecord = Object.freeze({
  id: '',
  enabled: false,
  manualEnabled: false,
  scheduleEnabled: false,
  scheduleStartAt: null,
  scheduleEndAt: null,
  isScheduledActive: false,
  activationSource: 'disabled',
  activeTheme: null,
  playerId: null,
  playerName: '',
  title: '',
  ribbonTitle: '',
  messages: [],
  ribbonMessages: [],
  palette: null,
  motionPreset: null,
  showGlobalRibbon: true,
  notifyOnStart: false,
  notificationAutoSentAt: null,
})

const createDefaultHolidayThemeConfig = (): AnyRecord => ({
  version: HOLIDAY_THEME_VERSION,
  activities: [],
  activeActivityId: null,
  activeActivity: { ...DEFAULT_ACTIVITY_STATE },
  enabled: false,
})

const rawHolidayThemeConfigState = ref<any>(null)
const holidayThemeState = ref<any>(createDefaultHolidayThemeConfig())
const holidayThemeLoading = ref(false)
const holidayThemeError = ref<any>(null)

let fetchPromise: Promise<any> | null = null
let consumerCount = 0
let visibilityListenerAttached = false
let scheduleRefreshTimer: ReturnType<typeof setInterval> | null = null
let hasFetchedHolidayThemeConfig = false

export const parseHolidayThemeInput = (value: unknown): any => {
  if (!value) return null

  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  if (typeof value === 'object') {
    return value
  }

  return null
}

export const cleanHolidayThemeMessages = (messages: unknown): string[] => {
  if (!Array.isArray(messages)) return []

  return messages
    .filter((message) => typeof message === 'string')
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, HOLIDAY_THEME_MAX_MESSAGES)
}

export const isHolidayThemePlayerTheme = (themeKey: unknown): boolean => {
  const normalizedTheme = normalizeThemeKey(themeKey)
  return PLAYER_THEME_KEYS.has(normalizedTheme || '')
}

const parseTaipeiLocalDateTime = (trimmed: string): Date | null => {
  const match = trimmed.match(LEGACY_LOCAL_DATE_TIME_RE)
  if (!match) return null

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) - 8,
      Number(minute),
      Number(second)
    )
  )

  return Number.isNaN(date.getTime()) ? null : date
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

  const legacyParsed = parseTaipeiLocalDateTime(trimmed)
  if (legacyParsed) return legacyParsed

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatTaipeiDateTimeParts = (value: unknown) => {
  const parsed = parseHolidayThemeDateTime(value)
  if (!parsed) return null

  const taipeiDate = new Date(parsed.getTime() + TAIPEI_OFFSET_MS)

  const year = taipeiDate.getUTCFullYear()
  const month = String(taipeiDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(taipeiDate.getUTCDate()).padStart(2, '0')
  const hour = String(taipeiDate.getUTCHours()).padStart(2, '0')
  const minute = String(taipeiDate.getUTCMinutes()).padStart(2, '0')
  const second = String(taipeiDate.getUTCSeconds()).padStart(2, '0')

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
  }
}

export const formatHolidayThemeDateTime = (value: unknown): string | null => {
  const parsed = parseHolidayThemeDateTime(value)
  if (!parsed) return null
  return parsed.toISOString().replace('.000Z', 'Z')
}

export const formatHolidayThemeInputDateTime = (value: unknown): string => {
  const parts = formatTaipeiDateTimeParts(value)
  if (!parts) return ''

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

export const formatHolidayThemeDisplayDateTime = (value: unknown): string => {
  const parts = formatTaipeiDateTimeParts(value)
  if (!parts) return ''

  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`
}

export const getHolidayThemePresetContent = (themeKey: unknown, context: AnyRecord = {}) => {
  const normalizedTheme = normalizeThemeKey(themeKey) || 'mothers_day'
  const preset = HOLIDAY_THEME_PRESETS[normalizedTheme] || HOLIDAY_THEME_PRESETS.mothers_day
  const playerName = normalizeString(context.playerName)

  const defaultTitle = normalizeString(
    resolvePresetValue(preset.defaultTitle, { playerName }, '')
  )
  const defaultMessages = cleanHolidayThemeMessages(
    resolvePresetValue(preset.defaultMessages, { playerName }, [])
  )

  return {
    key: normalizedTheme,
    label: preset.label,
    badgeText: preset.badgeText,
    defaultTitle,
    defaultMessages: defaultMessages.length ? defaultMessages : [defaultTitle].filter(Boolean),
    defaultMotionPreset: preset.defaultMotionPreset,
    paletteValues: preset.palette,
  }
}

export const buildHolidayThemeRibbonTitle = (themeKey: unknown, context: AnyRecord = {}) => {
  const preset = getHolidayThemePresetContent(themeKey, context)
  const label = normalizeString(preset.label)

  if (!label) return ''
  if (label.endsWith('祝福')) return label

  return `${label}祝福`
}

export const buildHolidayThemeMessageDraft = (messages: unknown = [], fallbackMessages: unknown = []): string[] => {
  const resolvedMessages = cleanHolidayThemeMessages(messages)
  const defaults = cleanHolidayThemeMessages(fallbackMessages)
  const source = resolvedMessages.length ? resolvedMessages : defaults

  return Array.from({ length: HOLIDAY_THEME_MAX_MESSAGES }, (_, index) => source[index] || '')
}

const resolveHolidayThemeRibbonMessages = (ribbonMessages: unknown = [], fallbackMessages: unknown = []): string[] => {
  const resolvedRibbonMessages = cleanHolidayThemeMessages(ribbonMessages)
  if (resolvedRibbonMessages.length) return resolvedRibbonMessages
  return cleanHolidayThemeMessages(fallbackMessages)
}

const isScheduleActive = (startAt: Date | null, endAt: Date | null, now = new Date()): boolean => {
  if (!startAt && !endAt) return false
  if (startAt && now < startAt) return false
  if (endAt && now > endAt) return false
  return true
}

export const normalizeHolidayThemeActivity = (
  input: unknown,
  { now = new Date(), defaultNotifyOnStart = false, fallbackId = null as string | null } = {}
): AnyRecord => {
  const parsed = parseHolidayThemeInput(input) || {}
  const activityId = normalizeString(parsed.id) || fallbackId || createHolidayThemeId()
  const activeThemeKey = normalizeThemeKey(parsed.activeTheme)
  const activeTheme = SUPPORTED_THEMES.has(activeThemeKey || '') ? activeThemeKey : null

  if (!activeTheme) {
    return {
      ...DEFAULT_ACTIVITY_STATE,
      id: activityId,
    }
  }

  const isPlayerTheme = isHolidayThemePlayerTheme(activeTheme)
  const playerName = isPlayerTheme ? normalizeString(parsed.playerName) : ''
  const preset = getHolidayThemePresetContent(activeTheme, { playerName })
  const manualEnabled = Boolean(parsed.manualEnabled ?? parsed.enabled)
  const scheduleEnabled = Boolean(parsed.scheduleEnabled)
  const scheduleStartAt = scheduleEnabled ? formatHolidayThemeDateTime(parsed.scheduleStartAt) : null
  const scheduleEndAt = scheduleEnabled ? formatHolidayThemeDateTime(parsed.scheduleEndAt) : null
  const isScheduledActive = scheduleEnabled
    ? isScheduleActive(
        parseHolidayThemeDateTime(scheduleStartAt),
        parseHolidayThemeDateTime(scheduleEndAt),
        now
      )
    : false
  const enabled = manualEnabled || isScheduledActive

  let activationSource = 'disabled'
  if (manualEnabled && isScheduledActive) activationSource = 'manual_and_scheduled'
  else if (manualEnabled) activationSource = 'manual'
  else if (isScheduledActive) activationSource = 'scheduled'

  const paletteKey = normalizeThemeKey(parsed.palette)
  const palette = SUPPORTED_THEMES.has(paletteKey || '') ? paletteKey : activeTheme
  const motionPresetKey = normalizeMotionPresetKey(parsed.motionPreset)
  const motionPreset = SUPPORTED_MOTION_PRESETS.has(motionPresetKey || '')
    ? motionPresetKey
    : preset.defaultMotionPreset
  const messages = cleanHolidayThemeMessages(parsed.messages)
  const resolvedMessages = messages.length ? messages : [...preset.defaultMessages]
  const defaultRibbonTitle = buildHolidayThemeRibbonTitle(activeTheme, { playerName })
  const ribbonMessages = resolveHolidayThemeRibbonMessages(parsed.ribbonMessages, resolvedMessages)

  return {
    id: activityId,
    enabled,
    manualEnabled,
    scheduleEnabled,
    scheduleStartAt,
    scheduleEndAt,
    isScheduledActive,
    activationSource,
    activeTheme,
    playerId: isPlayerTheme && parsed.playerId != null && parsed.playerId !== '' ? parsed.playerId : null,
    playerName,
    title: normalizeString(parsed.title) || preset.defaultTitle,
    ribbonTitle: normalizeString(parsed.ribbonTitle) || defaultRibbonTitle,
    messages: resolvedMessages,
    ribbonMessages,
    palette,
    motionPreset,
    showGlobalRibbon: parsed.showGlobalRibbon !== false,
    notifyOnStart: Boolean(parsed.notifyOnStart ?? defaultNotifyOnStart),
    notificationAutoSentAt: formatHolidayThemeDateTime(parsed.notificationAutoSentAt) || null,
  }
}

export const createHolidayThemeActivityDraft = (input: AnyRecord = {}) => {
  const normalizedActivity = normalizeHolidayThemeActivity(input)
  const preset = getHolidayThemePresetContent(normalizedActivity.activeTheme || 'mothers_day', {
    playerName: normalizedActivity.playerName,
  })
  const activityMessages = buildHolidayThemeMessageDraft(
    normalizedActivity.messages,
    preset.defaultMessages
  )

  return {
    id: normalizedActivity.id || createHolidayThemeId(),
    manualEnabled: normalizedActivity.manualEnabled,
    scheduleEnabled: normalizedActivity.scheduleEnabled,
    scheduleStartAt: formatHolidayThemeInputDateTime(normalizedActivity.scheduleStartAt),
    scheduleEndAt: formatHolidayThemeInputDateTime(normalizedActivity.scheduleEndAt),
    activeTheme: normalizedActivity.activeTheme || 'mothers_day',
    playerId: normalizedActivity.playerId,
    playerName: normalizedActivity.playerName,
    title: normalizedActivity.title || preset.defaultTitle,
    ribbonTitle: normalizedActivity.ribbonTitle || buildHolidayThemeRibbonTitle(
      normalizedActivity.activeTheme || 'mothers_day',
      { playerName: normalizedActivity.playerName }
    ),
    messages: activityMessages,
    ribbonMessages: buildHolidayThemeMessageDraft(
      normalizedActivity.ribbonMessages,
      activityMessages
    ),
    palette: normalizedActivity.palette || normalizedActivity.activeTheme || 'mothers_day',
    motionPreset: normalizedActivity.motionPreset || preset.defaultMotionPreset,
    showGlobalRibbon: normalizedActivity.showGlobalRibbon !== false,
    notifyOnStart: normalizedActivity.notifyOnStart,
    notificationAutoSentAt: normalizedActivity.notificationAutoSentAt,
  }
}

export const buildHolidayThemeConfigPayload = (activities: any[] = [], { now = new Date() } = {}) => ({
  version: HOLIDAY_THEME_VERSION,
  activities: activities
    .map((activity, index) =>
      normalizeHolidayThemeActivity(activity, {
        now,
        fallbackId: `holiday-theme-activity-${index + 1}`,
      })
    )
    .filter((activity) => activity.activeTheme)
    .map((activity) => ({
      id: activity.id,
      manualEnabled: activity.manualEnabled,
      scheduleEnabled: activity.scheduleEnabled,
      scheduleStartAt: activity.scheduleStartAt,
      scheduleEndAt: activity.scheduleEndAt,
      activeTheme: activity.activeTheme,
      playerId: activity.playerId,
      playerName: activity.playerName,
      title: activity.title,
      ribbonTitle: activity.ribbonTitle,
      messages: activity.messages,
      ribbonMessages: activity.ribbonMessages,
      palette: activity.palette,
      motionPreset: activity.motionPreset,
      showGlobalRibbon: activity.showGlobalRibbon,
      notifyOnStart: activity.notifyOnStart,
      notificationAutoSentAt: activity.notificationAutoSentAt,
    })),
})

export const normalizeHolidayThemeConfig = (input: unknown, { now = new Date() } = {}) => {
  const parsed = parseHolidayThemeInput(input)
  if (!parsed) return createDefaultHolidayThemeConfig()

  const rawActivities = Array.isArray(parsed.activities)
    ? parsed.activities
    : parsed.activeTheme
      ? [{ ...parsed, notifyOnStart: false }]
      : []

  const activities = (rawActivities as any[])
    .map((activity: any, index: number) =>
      normalizeHolidayThemeActivity(activity, {
        now,
        defaultNotifyOnStart: false,
        fallbackId: `holiday-theme-activity-${index + 1}`,
      })
    )
    .filter((activity: AnyRecord) => activity.activeTheme)

  const activeActivity = activities.find((activity: AnyRecord) => activity.enabled) || null

  return {
    version: HOLIDAY_THEME_VERSION,
    activities,
    activeActivityId: activeActivity?.id || null,
    activeActivity: activeActivity || { ...DEFAULT_ACTIVITY_STATE },
    enabled: Boolean(activeActivity?.enabled),
  }
}

const buildHolidayThemeToken = (activity: AnyRecord) => {
  if (!activity.enabled || !activity.activeTheme) return 'holiday-theme-disabled'

  return [
    activity.id,
    activity.activeTheme,
    activity.playerName || 'no-player',
    activity.manualEnabled ? 'manual-on' : 'manual-off',
    activity.scheduleEnabled ? 'schedule-on' : 'schedule-off',
    activity.scheduleStartAt || 'no-start',
    activity.scheduleEndAt || 'no-end',
    activity.title,
    activity.ribbonTitle,
    activity.messages.join('|'),
    activity.ribbonMessages.join('|'),
    activity.palette,
    activity.motionPreset,
    activity.showGlobalRibbon ? 'ribbon-on' : 'ribbon-off',
  ].join('::')
}

export const buildHolidayThemeDisplayState = (activity: unknown): AnyRecord => {
  const normalizedActivity = normalizeHolidayThemeActivity(activity)

  if (!normalizedActivity.enabled || !normalizedActivity.activeTheme) {
    return {
      ...DEFAULT_ACTIVITY_STATE,
      label: '',
      badgeText: '',
      ribbonTitle: '',
      ribbonMessages: [],
      ribbonMessage: '',
      paletteValues: null,
      token: buildHolidayThemeToken(DEFAULT_ACTIVITY_STATE),
    }
  }

  const activePreset = getHolidayThemePresetContent(normalizedActivity.activeTheme, {
    playerName: normalizedActivity.playerName,
  })
  const palettePreset =
    HOLIDAY_THEME_PRESETS[normalizedActivity.palette || normalizedActivity.activeTheme] ||
    HOLIDAY_THEME_PRESETS[normalizedActivity.activeTheme]
  const ribbonMessages = resolveHolidayThemeRibbonMessages(
    normalizedActivity.ribbonMessages,
    normalizedActivity.messages
  )

  return {
    ...normalizedActivity,
    label: activePreset.label,
    badgeText: activePreset.badgeText,
    ribbonTitle: normalizedActivity.ribbonTitle || buildHolidayThemeRibbonTitle(
      normalizedActivity.activeTheme,
      { playerName: normalizedActivity.playerName }
    ),
    ribbonMessages,
    ribbonMessage: ribbonMessages[0] || normalizedActivity.title,
    paletteValues: palettePreset.palette,
    token: buildHolidayThemeToken(normalizedActivity),
  }
}

export const buildHolidayThemeNotificationPayload = (activity: AnyRecord, { origin = '' } = {}) => {
  const displayTheme = buildHolidayThemeDisplayState({
    ...activity,
    enabled: true,
  })

  const baseOrigin = normalizeString(origin).replace(/\/$/, '')
  const targetUrl = baseOrigin ? `${baseOrigin}/` : '/'

  return {
    title: displayTheme.title || `${displayTheme.label || '首頁主題'} 已上線`,
    body: displayTheme.messages[0] || '首頁主題已更新，點我查看。',
    url: targetUrl,
  }
}

export const fetchHolidayThemeConfig = async ({ force = false } = {}) => {
  if (holidayThemeLoading.value && !force && fetchPromise) return fetchPromise
  if (hasFetchedHolidayThemeConfig && !force && !holidayThemeLoading.value) {
    return holidayThemeState.value
  }

  holidayThemeLoading.value = true
  holidayThemeError.value = null

  fetchPromise = Promise.resolve(supabase.rpc('get_public_holiday_theme_config'))
    .then(({ data, error }) => {
      if (error) throw error

      rawHolidayThemeConfigState.value = parseHolidayThemeInput(data)
      holidayThemeState.value = normalizeHolidayThemeConfig(rawHolidayThemeConfigState.value)
      hasFetchedHolidayThemeConfig = true
      return holidayThemeState.value
    })
    .catch((error: any) => {
      console.warn('Could not fetch holiday_theme_config', error)
      holidayThemeError.value = error
      rawHolidayThemeConfigState.value = null
      holidayThemeState.value = createDefaultHolidayThemeConfig()
      hasFetchedHolidayThemeConfig = true
      return holidayThemeState.value
    })
    .finally(() => {
      holidayThemeLoading.value = false
      fetchPromise = null
    })

  return fetchPromise
}

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    fetchHolidayThemeConfig({ force: true })
  }
}

const refreshHolidayThemeScheduleState = () => {
  if (!hasFetchedHolidayThemeConfig) return
  holidayThemeState.value = normalizeHolidayThemeConfig(rawHolidayThemeConfigState.value)
}

const registerVisibilityRefresh = () => {
  if (visibilityListenerAttached || typeof document === 'undefined') return
  document.addEventListener('visibilitychange', handleVisibilityChange)
  visibilityListenerAttached = true
}

const unregisterVisibilityRefresh = () => {
  if (!visibilityListenerAttached || typeof document === 'undefined' || consumerCount > 0) return
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  visibilityListenerAttached = false
}

const registerScheduleRefresh = () => {
  if (scheduleRefreshTimer || typeof window === 'undefined') return
  scheduleRefreshTimer = setInterval(refreshHolidayThemeScheduleState, HOLIDAY_THEME_SCHEDULE_REFRESH_MS)
}

const unregisterScheduleRefresh = () => {
  if (!scheduleRefreshTimer || consumerCount > 0) return
  clearInterval(scheduleRefreshTimer)
  scheduleRefreshTimer = null
}

export function useHolidayTheme() {
  consumerCount += 1

  const holidayTheme = computed(() => buildHolidayThemeDisplayState(holidayThemeState.value.activeActivity))

  onMounted(() => {
    fetchHolidayThemeConfig()
    registerVisibilityRefresh()
    registerScheduleRefresh()
  })

  onUnmounted(() => {
    consumerCount = Math.max(consumerCount - 1, 0)
    unregisterVisibilityRefresh()
    unregisterScheduleRefresh()
  })

  return {
    holidayTheme,
    holidayThemeConfig: computed(() => holidayThemeState.value),
    loading: computed(() => holidayThemeLoading.value),
    error: computed(() => holidayThemeError.value),
    fetchHolidayThemeConfig,
  }
}
