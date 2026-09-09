import type { PlayerIdentityMember, PlayerIdentityOption } from '@/types/playerIdentity'
import { NO_FEE_BILLING_MODE, ROLE_DEFAULT_FEE_BILLING_MODE, normalizeMemberFeeBillingMode } from './memberBilling'
import { normalizeTeamGroup } from './teamGroups'
import { CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY, JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY, normalizeTrainingProgramKey } from './trainingPrograms'

export const COMMUNITY_PLAYER_IDENTITY = 'community_player'
export const CHUNGGANG_PLAYER_IDENTITY = 'chunggang_player'
export const XINTAI_PLAYER_IDENTITY = 'xintai_player'
export const NEW_SUN_PLAYER_IDENTITY = '新太陽社區棒球隊'
export const MAX_PLAYER_IDENTITY_LENGTH = 60
export const SCHOOL_TEAM_GROUP_VALUES = ['中港校隊', '國中校隊']

export const BUILTIN_PLAYER_IDENTITIES: PlayerIdentityOption[] = [
  { label: '社區球員', value: COMMUNITY_PLAYER_IDENTITY },
  { label: '中港校隊', value: CHUNGGANG_PLAYER_IDENTITY },
  { label: '國中部', value: XINTAI_PLAYER_IDENTITY },
  { label: '教練', value: '教練' },
  { label: '管理群', value: '管理群' },
  { label: '其他', value: '其他' }
]

export const normalizePlayerIdentity = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : ''
  return BUILTIN_PLAYER_IDENTITIES.find(option => option.value === text || option.label === text)?.value || text
}

export const isCustomPlayerIdentity = (value: unknown) => {
  const identity = normalizePlayerIdentity(value)
  return !!identity && !BUILTIN_PLAYER_IDENTITIES.some(option => option.value === identity)
}

export const getPlayerIdentityError = (value: unknown) => {
  const identity = normalizePlayerIdentity(value)
  if (!identity) return '請選擇或輸入身分'
  if (Array.from(identity).length > MAX_PLAYER_IDENTITY_LENGTH) return `身分最多 ${MAX_PLAYER_IDENTITY_LENGTH} 字`
  if (/[\u0000-\u001f\u007f]/u.test(identity)) return '身分不可包含換行或控制字元'
  return ''
}

export const getMemberIdentityValue = (member: PlayerIdentityMember) => {
  if (member.role === '球員') {
    return isCustomPlayerIdentity(member.member_identity_label)
      ? normalizePlayerIdentity(member.member_identity_label)
      : COMMUNITY_PLAYER_IDENTITY
  }
  if (member.role === '校隊') {
    const program = normalizeTrainingProgramKey(member.training_program, '')
    if (program === JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY) return XINTAI_PLAYER_IDENTITY
    if (program === CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY) return CHUNGGANG_PLAYER_IDENTITY
    return normalizeTeamGroup(member.team_group) === '國中校隊' ? XINTAI_PLAYER_IDENTITY : CHUNGGANG_PLAYER_IDENTITY
  }
  return ['教練', '管理群', '其他'].includes(member.role || '') ? member.role! : '其他'
}

export const getMemberIdentityLabel = (member: PlayerIdentityMember) => {
  const identity = getMemberIdentityValue(member)
  return BUILTIN_PLAYER_IDENTITIES.find(option => option.value === identity)?.label || identity
}

export const buildPlayerIdentityOptions = (savedLabels: string[] = [], members: PlayerIdentityMember[] = []) => {
  const customLabels = new Set([NEW_SUN_PLAYER_IDENTITY, ...savedLabels, ...members.map(member => member.member_identity_label || '')]
    .map(normalizePlayerIdentity)
    .filter(label => isCustomPlayerIdentity(label) && !getPlayerIdentityError(label)))
  return [...BUILTIN_PLAYER_IDENTITIES, ...Array.from(customLabels).map(label => ({ label, value: label }))]
}

export const normalizeBillingModeForRole = (role?: string | null, mode?: string | null) => {
  const normalized = normalizeMemberFeeBillingMode(mode)
  if (role === '球員') return normalized
  if (role === '校隊' && normalized === NO_FEE_BILLING_MODE) return normalized
  return ROLE_DEFAULT_FEE_BILLING_MODE
}

// Called only after an intentional selection, never while hydrating an edit form.
export const getPlayerIdentityFormPatch = (value: string, current: PlayerIdentityMember, defaultGroup: string) => {
  const identity = normalizePlayerIdentity(value)
  const error = getPlayerIdentityError(identity)
  if (error) throw new Error(error)
  const isPlayer = identity === COMMUNITY_PLAYER_IDENTITY || isCustomPlayerIdentity(identity)
  const isSchoolTeam = identity === CHUNGGANG_PLAYER_IDENTITY || identity === XINTAI_PLAYER_IDENTITY
  const role = isPlayer ? '球員' : isSchoolTeam ? '校隊' : identity
  const teamGroup = normalizeTeamGroup(current.team_group)
  return {
    member_identity: identity,
    member_identity_label: isCustomPlayerIdentity(identity) ? identity : null,
    role,
    training_program: isSchoolTeam
      ? identity === XINTAI_PLAYER_IDENTITY ? JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY : CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY
      : null,
    team_group: isPlayer
      ? !teamGroup || SCHOOL_TEAM_GROUP_VALUES.includes(teamGroup) ? defaultGroup : teamGroup
      : isSchoolTeam ? teamGroup || defaultGroup : '',
    fee_billing_mode: normalizeBillingModeForRole(role, current.fee_billing_mode)
  }
}

// A form sync must not replace a manually assigned community identity with a school-team role.
export const getPlayerRoleForGoogleFormSync = (rawRole: string, isSchoolTeam: boolean, existing?: PlayerIdentityMember) => {
  if (existing?.role === '球員' && isCustomPlayerIdentity(existing.member_identity_label)) return '球員'
  if (isSchoolTeam) return '校隊'
  return ['教練', '管理群', '其他'].includes(rawRole) ? rawRole : '球員'
}
