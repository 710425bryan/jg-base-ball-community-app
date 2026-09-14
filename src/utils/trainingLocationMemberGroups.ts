import type { TrainingLocationRosterMember } from '@/types/trainingLocation'
import { normalizeTeamGroup } from '@/utils/teamGroups'

type MemberGroup = {
  key: string
  role: string
  teamGroup: string
  nonCompeting: boolean
  members: TrainingLocationRosterMember[]
}

const getGroupSize = (group: string) => {
  const age = group.normalize('NFKC').match(/u\s*(\d+)/i)
  if (age) return Number(age[1])
  if (group.includes('大組')) return 12
  if (group.includes('中組')) return 10
  if (group.includes('小組')) return 8
  return 0
}

const getRoleOrder = (role: string) => role === '校隊' ? 0 : role === '球員' ? 1 : 2

export const groupTrainingLocationMembers = (members: TrainingLocationRosterMember[]) => {
  const groups = new Map<string, MemberGroup>()

  for (const member of members) {
    const role = member.role?.trim() || '球員'
    const teamGroup = normalizeTeamGroup(member.team_group) || '未分組'
    const key = JSON.stringify([role, teamGroup])
    let group = groups.get(key)
    if (!group) {
      group = { key, role, teamGroup, nonCompeting: teamGroup.includes('不參賽'), members: [] }
      groups.set(key, group)
    }
    group.members.push(member)
  }

  return [...groups.values()].sort((left, right) =>
    Number(left.nonCompeting) - Number(right.nonCompeting) ||
    getRoleOrder(left.role) - getRoleOrder(right.role) ||
    left.role.localeCompare(right.role, 'zh-TW') ||
    getGroupSize(right.teamGroup) - getGroupSize(left.teamGroup) ||
    left.teamGroup.localeCompare(right.teamGroup, 'zh-TW', { numeric: true })
  )
}
