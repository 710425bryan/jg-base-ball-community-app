import type { TeamGroupOption, TeamGroupSetting } from '@/types/teamGroup'

const DEFAULT_TEAM_GROUP_STYLES = [
  {
    name: '拉拉熊(小組)',
    accentClass: 'bg-orange-400',
    badgeClass: 'bg-orange-50 text-orange-600 border-orange-200'
  },
  {
    name: '泰迪熊(小組)',
    accentClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  {
    name: '黑熊(中組)',
    accentClass: 'bg-neutral-800',
    badgeClass: 'bg-neutral-800 text-neutral-100 border-neutral-700'
  },
  {
    name: '北極熊(中組)',
    accentClass: 'bg-sky-400',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200'
  },
  {
    name: '暴力熊(大組)',
    accentClass: 'bg-red-600',
    badgeClass: 'bg-red-50 text-red-700 border-red-200'
  }
] as const

const EXTRA_TEAM_GROUP_STYLES = [
  {
    accentClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  {
    accentClass: 'bg-violet-500',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200'
  },
  {
    accentClass: 'bg-blue-600',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    accentClass: 'bg-rose-500',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
  },
  {
    accentClass: 'bg-teal-500',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200'
  },
  {
    accentClass: 'bg-slate-500',
    badgeClass: 'bg-slate-50 text-slate-700 border-slate-200'
  }
] as const

const LEGACY_TEAM_GROUP_RENAMES: Record<string, string> = {
  '灰熊(大組)': '暴力熊(大組)',
  '成灰熊(中組)': '黑熊(中組)'
}

const defaultStyleByName = new Map<string, {
  name: string
  accentClass: string
  badgeClass: string
}>(DEFAULT_TEAM_GROUP_STYLES.map((style) => [style.name, style]))

const fallbackSetting = (
  name: string,
  index: number
): TeamGroupSetting => ({
  id: `default:${name}`,
  name,
  sort_order: (index + 1) * 10,
  member_count: 0,
  created_at: null,
  updated_at: null
})

export const defaultTeamGroupSettings: TeamGroupSetting[] = DEFAULT_TEAM_GROUP_STYLES.map((style, index) =>
  fallbackSetting(style.name, index)
)

export const normalizeTeamGroup = (teamGroup: unknown) => {
  const group = typeof teamGroup === 'string' ? teamGroup.trim() : ''
  return group ? LEGACY_TEAM_GROUP_RENAMES[group] || group : group
}

export const isTeamGroupEligibleRole = (role: string | null | undefined) =>
  role === '球員' || role === '校隊'

const getStableStyleIndex = (name: string) => {
  let hash = 0
  for (const char of name) {
    hash = (hash + char.charCodeAt(0)) % EXTRA_TEAM_GROUP_STYLES.length
  }
  return hash
}

const getTeamGroupStyle = (name: string, index: number) => {
  const normalizedName = normalizeTeamGroup(name)
  const defaultStyle = defaultStyleByName.get(normalizedName)
  if (defaultStyle) return defaultStyle

  return EXTRA_TEAM_GROUP_STYLES[index % EXTRA_TEAM_GROUP_STYLES.length] ||
    EXTRA_TEAM_GROUP_STYLES[getStableStyleIndex(normalizedName)]
}

export const decorateTeamGroupSettings = (settings: TeamGroupSetting[]): TeamGroupOption[] =>
  [...settings]
    .sort((left, right) =>
      left.sort_order - right.sort_order ||
      left.name.localeCompare(right.name, 'zh-TW')
    )
    .map((setting, index) => {
      const style = getTeamGroupStyle(setting.name, index)
      return {
        ...setting,
        name: normalizeTeamGroup(setting.name),
        label: normalizeTeamGroup(setting.name),
        value: normalizeTeamGroup(setting.name),
        accentClass: style.accentClass,
        badgeClass: style.badgeClass
      }
    })

export const getTeamGroupSortValue = (
  group: string | null | undefined,
  options: Pick<TeamGroupOption, 'value' | 'sort_order'>[]
) => {
  const normalizedGroup = normalizeTeamGroup(group)
  if (!normalizedGroup) return Number.MAX_SAFE_INTEGER

  const option = options.find((item) => item.value === normalizedGroup)
  return option ? option.sort_order : Number.MAX_SAFE_INTEGER - 1
}

export const getTeamGroupAccentClass = (
  group: string | null | undefined,
  options: TeamGroupOption[]
) => {
  const normalizedGroup = normalizeTeamGroup(group)
  return options.find((option) => option.value === normalizedGroup)?.accentClass || 'bg-slate-300'
}

export const getTeamGroupBadgeClass = (
  group: string | null | undefined,
  options: TeamGroupOption[]
) => {
  const normalizedGroup = normalizeTeamGroup(group)
  return options.find((option) => option.value === normalizedGroup)?.badgeClass || 'bg-gray-50 text-gray-500 border-gray-200'
}

export const getUniqueTeamGroupOptions = (
  groupNames: Array<string | null | undefined>,
  configuredOptions: TeamGroupOption[]
) => {
  const configuredValues = new Set(configuredOptions.map((option) => option.value))
  const extraNames = Array.from(
    new Set(
      groupNames
        .map(normalizeTeamGroup)
        .filter(Boolean)
    )
  ).filter((name) => !configuredValues.has(name))

  const extraOptions = decorateTeamGroupSettings(extraNames.map((name, index) => ({
    id: `existing:${name}`,
    name,
    sort_order: 10000 + index,
    member_count: 0,
    created_at: null,
    updated_at: null
  })))

  return [...configuredOptions, ...extraOptions]
}
