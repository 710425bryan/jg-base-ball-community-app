import { describe, expect, it } from 'vitest'
import type { TrainingLocationRosterMember } from '@/types/trainingLocation'
import { groupTrainingLocationMembers } from './trainingLocationMemberGroups'

const member = (id: string, role: string | null, team_group: string | null): TrainingLocationRosterMember => ({
  member_id: id, name: id, role, team_group, jersey_number: null,
  fee_billing_mode: 'role_default', is_on_leave: false
})

describe('groupTrainingLocationMembers', () => {
  it('groups school teams before players and orders U levels numerically from largest to smallest', () => {
    const members = [
      member('p8', '球員', 'U8熊戰組'), member('s9', '校隊', 'U9熊戰組'),
      member('p12', '球員', 'U12熊戰組'), member('s8', '校隊', 'U8熊戰組'),
      member('s12', '校隊', 'U12熊戰組'), member('s10', '校隊', 'U10熊戰組'),
      member('s11', '校隊', 'U11熊戰組'), member('s12b', '校隊', 'U12熊戰組')
    ]
    const originalIds = members.map((item) => item.member_id)
    const groups = groupTrainingLocationMembers(members)
    expect(groups.map((group) => group.members.map((item) => item.member_id))).toEqual([
      ['s12', 's12b'], ['s11'], ['s10'], ['s9'], ['s8'], ['p12'], ['p8']
    ])
    expect(members.map((item) => item.member_id)).toEqual(originalIds)
  })

  it('puts all non-competing groups after both roles without treating leave or no-fee as non-competing', () => {
    const leave = { ...member('leave', '校隊', 'U8熊戰組'), is_on_leave: true }
    const noFee = { ...member('no-fee', '球員', 'U8熊戰組'), fee_billing_mode: 'no_fee' }
    const groups = groupTrainingLocationMembers([
      member('skip-player', '球員', 'U12熊戰組（不參賽）'),
      member('skip-school', '校隊', '不參賽'), leave, noFee
    ])
    expect(groups.flatMap((group) => group.members.map((item) => item.member_id))).toEqual([
      'leave', 'no-fee', 'skip-school', 'skip-player'
    ])
  })

  it('supports legacy size labels and keeps unknown or missing groups visible after known sizes', () => {
    const groups = groupTrainingLocationMembers([
      member('unknown', '球員', '新泰熊戰'), member('small', '球員', '拉拉熊(小組)'),
      member('missing', null, null), member('large', '球員', '暴力熊(大組)'),
      member('medium', '球員', '黑熊(中組)')
    ])
    expect(groups.slice(0, 3).map((group) => group.members[0].member_id)).toEqual(['large', 'medium', 'small'])
    expect(groups.find((group) => group.teamGroup === '未分組')?.members[0].member_id).toBe('missing')
    expect(groups.flatMap((group) => group.members)).toHaveLength(5)
    expect(groupTrainingLocationMembers([])).toEqual([])
  })
})
