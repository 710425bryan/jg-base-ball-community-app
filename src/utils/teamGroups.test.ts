import { describe, expect, it } from 'vitest'
import {
  decorateTeamGroupSettings,
  defaultTeamGroupSettings,
  getTeamGroupAccentClass,
  getTeamGroupBadgeClass,
  getTeamGroupSortValue,
  getUniqueTeamGroupOptions,
  isTeamGroupEligibleRole,
  normalizeTeamGroup
} from './teamGroups'

const buildSetting = (id: string, name: string, sortOrder: number) => ({
  id,
  name,
  sort_order: sortOrder,
  member_count: 0,
  created_at: null,
  updated_at: null
})

describe('teamGroups utilities', () => {
  it('normalizes legacy group names and role eligibility', () => {
    expect(normalizeTeamGroup(' 灰熊(大組) ')).toBe('暴力熊(大組)')
    expect(normalizeTeamGroup('成灰熊(中組)')).toBe('黑熊(中組)')
    expect(normalizeTeamGroup('')).toBe('')
    expect(isTeamGroupEligibleRole('球員')).toBe(true)
    expect(isTeamGroupEligibleRole('校隊')).toBe(true)
    expect(isTeamGroupEligibleRole('教練')).toBe(false)
  })

  it('decorates settings in sort order with stable labels and classes', () => {
    const options = decorateTeamGroupSettings([
      buildSetting('b', '泰迪熊(小組)', 20),
      buildSetting('a', '灰熊(大組)', 10)
    ])

    expect(options.map((option) => option.value)).toEqual(['暴力熊(大組)', '泰迪熊(小組)'])
    expect(options[0]?.accentClass).toBe('bg-red-600')
    expect(options[1]?.badgeClass).toContain('amber')
  })

  it('sorts unknown groups after configured groups and uses fallback classes', () => {
    const options = decorateTeamGroupSettings(defaultTeamGroupSettings)

    expect(getTeamGroupSortValue('拉拉熊(小組)', options)).toBe(10)
    expect(getTeamGroupSortValue('不存在組別', options)).toBe(Number.MAX_SAFE_INTEGER - 1)
    expect(getTeamGroupSortValue(null, options)).toBe(Number.MAX_SAFE_INTEGER)
    expect(getTeamGroupAccentClass(null, options)).toBe('bg-slate-300')
    expect(getTeamGroupBadgeClass('不存在組別', options)).toBe('bg-gray-50 text-gray-500 border-gray-200')
  })

  it('adds unique existing group names that are not configured yet', () => {
    const configured = decorateTeamGroupSettings([buildSetting('a', '拉拉熊(小組)', 10)])
    const options = getUniqueTeamGroupOptions([
      '拉拉熊(小組)',
      '國中校隊',
      '國中校隊',
      '灰熊(大組)',
      null
    ], configured)

    expect(options.map((option) => option.value)).toEqual(['拉拉熊(小組)', '國中校隊', '暴力熊(大組)'])
  })
})
