import type {
  TrainingProgramMemberLike,
  TrainingProgramSetting
} from '@/types/trainingProgram'
import { isPerSessionMonthlyBillingMember } from '@/utils/memberBilling'

export const CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY = 'chunggang_school_team'
export const JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY = 'junior_high_school_team'
export const DEFAULT_TRAINING_PROGRAM_KEY = CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY

export const DEFAULT_TRAINING_PROGRAM_LABEL = '中港總部'

export const DEFAULT_TRAINING_PROGRAM_SETTINGS: TrainingProgramSetting[] = [
  {
    program_key: CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
    label: '中港總部',
    team_group: '中港校隊',
    default_weekdays: [6],
    default_start_time: '09:00',
    default_end_time: '12:30',
    default_venue_name: '中港國小',
    default_venue_address: null,
    default_venue_maps_url: null,
    sort_order: 10,
    is_active: true,
    created_at: null,
    updated_at: null
  },
  {
    program_key: JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY,
    label: '新泰總部',
    team_group: '國中校隊',
    default_weekdays: [0],
    default_start_time: '09:00',
    default_end_time: '12:00',
    default_venue_name: '新泰國中',
    default_venue_address: null,
    default_venue_maps_url: null,
    sort_order: 20,
    is_active: true,
    created_at: null,
    updated_at: null
  }
]

const WEEKDAY_SET = new Set([0, 1, 2, 3, 4, 5, 6])
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const normalizeText = (value: unknown) => String(value ?? '').trim()

export const normalizeTrainingProgramLabel = (value: unknown) => {
  const label = normalizeText(value)
  if (label === '中港校隊') return '中港總部'
  if (label === '新泰校隊' || label === '國中校隊') return '新泰總部'
  return label
}

const normalizeNullableText = (value: unknown) => {
  const text = normalizeText(value)
  return text || null
}

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const normalizeTrainingProgramKey = (
  value?: string | null,
  fallback = DEFAULT_TRAINING_PROGRAM_KEY
) => {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

export const getTrainingProgramTagClass = (programKey?: string | null) => {
  const normalizedKey = normalizeTrainingProgramKey(programKey, '')

  if (normalizedKey === JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY) {
    return 'border-sky-200 bg-sky-50 text-sky-700'
  }

  if (normalizedKey === CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }

  return 'border-slate-200 bg-slate-50 text-slate-600'
}

export const normalizeTrainingProgramWeekdays = (value: unknown, fallback: number[] = [6]) => {
  const rawValues = Array.isArray(value) ? value : [value]
  const weekdays = rawValues
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && WEEKDAY_SET.has(item))

  const normalized = Array.from(new Set(weekdays)).sort((left, right) => left - right)
  return normalized.length > 0 ? normalized : [...fallback]
}

export const normalizeTrainingProgramTime = (value: unknown) => {
  const text = normalizeText(value)
  return TIME_PATTERN.test(text) ? text : null
}

export const normalizeTrainingProgramSetting = (row: any): TrainingProgramSetting => ({
  program_key: normalizeTrainingProgramKey(row?.program_key),
  label: normalizeTrainingProgramLabel(row?.label) || DEFAULT_TRAINING_PROGRAM_LABEL,
  team_group: normalizeNullableText(row?.team_group),
  default_weekdays: normalizeTrainingProgramWeekdays(row?.default_weekdays),
  default_start_time: normalizeTrainingProgramTime(row?.default_start_time),
  default_end_time: normalizeTrainingProgramTime(row?.default_end_time),
  default_venue_name: normalizeNullableText(row?.default_venue_name),
  default_venue_address: normalizeNullableText(row?.default_venue_address),
  default_venue_maps_url: normalizeNullableText(row?.default_venue_maps_url),
  sort_order: normalizeNumber(row?.sort_order),
  is_active: row?.is_active !== false,
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null
})

export const sortTrainingProgramSettings = (settings: TrainingProgramSetting[]) =>
  [...settings].sort((left, right) => {
    const sortDiff = left.sort_order - right.sort_order
    if (sortDiff !== 0) return sortDiff
    return left.label.localeCompare(right.label, 'zh-Hant')
  })

export const getActiveTrainingProgramSettings = (settings: TrainingProgramSetting[]) =>
  sortTrainingProgramSettings(settings.filter((setting) => setting.is_active))

export const getTrainingProgramFallbackSettings = () =>
  DEFAULT_TRAINING_PROGRAM_SETTINGS.map((setting) => ({ ...setting, default_weekdays: [...setting.default_weekdays] }))

export const ensureTrainingProgramSettings = (settings: TrainingProgramSetting[] | null | undefined) => {
  const normalized = Array.isArray(settings)
    ? settings.map(normalizeTrainingProgramSetting)
    : []

  return normalized.length > 0
    ? sortTrainingProgramSettings(normalized)
    : getTrainingProgramFallbackSettings()
}

export const getTrainingProgramSettingByKey = (
  settings: TrainingProgramSetting[],
  programKey?: string | null
) => {
  const normalizedKey = normalizeTrainingProgramKey(programKey)
  return settings.find((setting) => setting.program_key === normalizedKey)
    || settings.find((setting) => setting.program_key === DEFAULT_TRAINING_PROGRAM_KEY)
    || getTrainingProgramFallbackSettings()[0]
}

const normalizeComparableTeamGroup = (value?: string | null) =>
  normalizeText(value).toLowerCase()

export const getScopedTrainingProgramForMember = (
  member: TrainingProgramMemberLike | null | undefined,
  settings: TrainingProgramSetting[]
) => {
  const activeSettings = getActiveTrainingProgramSettings(settings)
  const trainingProgramKey = normalizeTrainingProgramKey(member?.training_program, '')
  const directProgram = trainingProgramKey
    ? activeSettings.find((setting) => setting.program_key === trainingProgramKey)
    : null

  if (directProgram) return directProgram

  const teamGroup = normalizeComparableTeamGroup(member?.team_group)
  const matched = teamGroup
    ? activeSettings.find((setting) => normalizeComparableTeamGroup(setting.team_group) === teamGroup)
    : null

  if (matched) return matched

  if (
    member?.role === '校隊' ||
    isPerSessionMonthlyBillingMember(member || {})
  ) {
    return getTrainingProgramSettingByKey(activeSettings, DEFAULT_TRAINING_PROGRAM_KEY)
  }

  return null
}

export const getTrainingProgramForMember = (
  member: TrainingProgramMemberLike | null | undefined,
  settings: TrainingProgramSetting[]
) => {
  const scopedProgram = getScopedTrainingProgramForMember(member, settings)
  if (scopedProgram) return scopedProgram

  return getTrainingProgramSettingByKey(settings, DEFAULT_TRAINING_PROGRAM_KEY)
}

export const getTrainingProgramKeyForMember = (
  member: TrainingProgramMemberLike | null | undefined,
  settings: TrainingProgramSetting[]
) => getScopedTrainingProgramForMember(member, settings)?.program_key || null

export const getTrainingProgramLabel = (
  settings: TrainingProgramSetting[],
  programKey?: string | null
) => getTrainingProgramSettingByKey(settings, programKey).label

export const buildTrainingProgramOptions = (settings: TrainingProgramSetting[]) =>
  getActiveTrainingProgramSettings(settings).map((setting) => ({
    value: setting.program_key,
    label: setting.label
  }))

export const createTrainingProgramMonthCacheKey = (programKey: string | null | undefined, month: string) =>
  `${normalizeTrainingProgramKey(programKey)}:${month}`
