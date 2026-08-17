import { isActiveRosterMember, type MemberLifecycleState } from '@/utils/memberLifecycle'
import {
  JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY,
  normalizeTrainingProgramKey
} from '@/utils/trainingPrograms'

export const DASHBOARD_MEMBER_STAT_ROLES = ['球員', '校隊', '教練'] as const

export type DashboardMemberStatRow = MemberLifecycleState & {
  training_program?: string | null
}

export type DashboardMemberStats = {
  totalMembers: number
  elementarySchoolTeamMembers: number
  juniorHighSchoolTeamMembers: number
  communityMembers: number
  coachMembers: number
  activeMemberIds: Set<string>
}

const isDashboardMemberRole = (role?: string | null) =>
  DASHBOARD_MEMBER_STAT_ROLES.includes(role as typeof DASHBOARD_MEMBER_STAT_ROLES[number])

const isJuniorHighSchoolTeamMember = (member: DashboardMemberStatRow) =>
  member.role === '校隊' &&
  normalizeTrainingProgramKey(member.training_program, '') === JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY

export const buildDashboardMemberStats = (
  rosterMembers: DashboardMemberStatRow[]
): DashboardMemberStats => {
  const activeMembers = rosterMembers.filter((member) =>
    isDashboardMemberRole(member.role) && isActiveRosterMember(member)
  )
  const juniorHighSchoolTeamMembers = activeMembers.filter(isJuniorHighSchoolTeamMember).length
  const elementarySchoolTeamMembers = activeMembers.filter((member) =>
    member.role === '校隊' && !isJuniorHighSchoolTeamMember(member)
  ).length
  const communityMembers = activeMembers.filter((member) => member.role === '球員').length
  const coachMembers = activeMembers.filter((member) => member.role === '教練').length
  const activeMemberIds = new Set(
    activeMembers
      .map((member) => member.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  )

  return {
    totalMembers: elementarySchoolTeamMembers + juniorHighSchoolTeamMembers + communityMembers,
    elementarySchoolTeamMembers,
    juniorHighSchoolTeamMembers,
    communityMembers,
    coachMembers,
    activeMemberIds
  }
}
