import { describe, expect, it } from 'vitest'
import {
  buildPlayerIdentityOptions, COMMUNITY_PLAYER_IDENTITY, getMemberIdentityLabel,
  getMemberIdentityValue, getPlayerIdentityError, getPlayerIdentityFormPatch,
  getPlayerRoleForGoogleFormSync, NEW_SUN_PLAYER_IDENTITY, normalizePlayerIdentity
} from './playerIdentity'
import { getEffectivePaymentBillingMode } from './memberBilling'
import { isTeamGroupEligibleRole } from './teamGroups'

describe('player identities', () => {
  const community = { role: '球員', team_group: '黑熊(中組)', training_program: null, fee_billing_mode: 'role_default' }

  it('includes the new team and remembers deduplicated saved labels independently of members', () => {
    const options = buildPlayerIdentityOptions([' 新太陽社區棒球隊 ', '週日棒球隊', '週日棒球隊', '社區球員'])
    expect(options.filter(option => option.label === NEW_SUN_PLAYER_IDENTITY)).toHaveLength(1)
    expect(options.filter(option => option.label === '社區球員')).toHaveLength(1)
    expect(options).toContainEqual({ label: '週日棒球隊', value: '週日棒球隊' })
    expect(buildPlayerIdentityOptions([], [{ ...community, member_identity_label: '晨間棒球隊' }]))
      .toContainEqual({ label: '晨間棒球隊', value: '晨間棒球隊' })
  })

  it.each([
    ['role_default', 'quarterly'], ['monthly_fixed', 'monthly'],
    ['monthly_per_session', 'monthly'], ['no_fee', 'none']
  ])('keeps %s billing and player eligibility when changing custom identity', (mode, expected) => {
    const patch = getPlayerIdentityFormPatch(NEW_SUN_PLAYER_IDENTITY, { ...community, fee_billing_mode: mode }, '泰迪熊(小組)')
    expect(patch).toMatchObject({ role: '球員', training_program: null, team_group: '黑熊(中組)', member_identity_label: NEW_SUN_PLAYER_IDENTITY, fee_billing_mode: mode })
    expect(getEffectivePaymentBillingMode(patch)).toBe(expected)
    expect(isTeamGroupEligibleRole(patch.role)).toBe(true)
    expect(getMemberIdentityValue(patch)).toBe(NEW_SUN_PLAYER_IDENTITY)
    expect(getMemberIdentityLabel(patch)).toBe(NEW_SUN_PLAYER_IDENTITY)
    const other = getPlayerIdentityFormPatch('週日棒球隊', patch, '')
    expect(other.fee_billing_mode).toBe(mode)
    expect(getPlayerIdentityFormPatch(COMMUNITY_PLAYER_IDENTITY, other, '')).toMatchObject({ member_identity_label: null, fee_billing_mode: mode, role: '球員' })
  })

  it('separates custom community identity from school-team and staff roles', () => {
    const custom = getPlayerIdentityFormPatch('週日棒球隊', { ...community, role: '校隊', training_program: 'junior_high_school_team', fee_billing_mode: 'no_fee' }, '')
    expect(custom).toMatchObject({ role: '球員', training_program: null, fee_billing_mode: 'no_fee' })
    expect(getPlayerIdentityFormPatch('國中部', custom, '')).toMatchObject({ role: '校隊', training_program: 'junior_high_school_team', member_identity_label: null, fee_billing_mode: 'no_fee' })
    expect(getPlayerIdentityFormPatch('教練', custom, '')).toMatchObject({ role: '教練', member_identity_label: null, training_program: null, team_group: '' })
  })

  it.each([
    [{ role: '球員' }, '社區球員'],
    [{ role: '校隊', training_program: 'junior_high_school_team' }, '國中部'],
    [{ role: '校隊', training_program: 'chunggang_school_team', team_group: '國中校隊' }, '中港校隊'],
    [{ role: '校隊', team_group: '國中校隊' }, '國中部'],
    [{ role: '教練', member_identity_label: '不該套用的自訂身份' }, '教練']
  ])('reads existing built-in identities without altering them', (member, label) => {
    expect(getMemberIdentityLabel(member)).toBe(label)
  })

  it('normalizes aliases and validates Unicode length and blank/control input', () => {
    expect(normalizePlayerIdentity(' 社區球員 ')).toBe(COMMUNITY_PLAYER_IDENTITY)
    expect(normalizePlayerIdentity(' 新太陽社區棒球隊 ')).toBe(NEW_SUN_PLAYER_IDENTITY)
    expect(getPlayerIdentityError(' '.repeat(10))).toBeTruthy()
    expect(getPlayerIdentityError('隊\n伍')).toBeTruthy()
    expect(getPlayerIdentityError('熊'.repeat(61))).toBeTruthy()
    expect(getPlayerIdentityError('⚾'.repeat(60))).toBe('')
    expect(() => getPlayerIdentityFormPatch('熊'.repeat(61), community, '')).toThrow('最多 60 字')
  })

  it('protects manually assigned community identities during Google form sync', () => {
    expect(getPlayerRoleForGoogleFormSync('教練', true, { ...community, member_identity_label: NEW_SUN_PLAYER_IDENTITY })).toBe('球員')
    expect(getPlayerRoleForGoogleFormSync('球員', true, community)).toBe('校隊')
    expect(getPlayerRoleForGoogleFormSync('教練', false)).toBe('教練')
    expect(getPlayerRoleForGoogleFormSync('新同學', false)).toBe('球員')
  })
})
