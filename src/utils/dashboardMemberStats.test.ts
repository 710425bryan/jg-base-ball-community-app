import { describe, expect, it } from 'vitest'
import { buildDashboardMemberStats } from './dashboardMemberStats'

describe('dashboard member stats', () => {
  it('splits elementary and junior-high school team members', () => {
    const stats = buildDashboardMemberStats([
      { id: 'elementary-1', role: '校隊', training_program: 'chunggang_school_team', status: '在隊' },
      { id: 'legacy-elementary-1', role: '校隊', training_program: null, status: '在隊' },
      { id: 'junior-high-1', role: '校隊', training_program: 'junior_high_school_team', status: '在隊' },
      { id: 'junior-high-2', role: '校隊', training_program: 'Junior High School Team', status: '在隊' },
      { id: 'community-1', role: '球員', status: '在隊' },
      { id: 'coach-1', role: '教練', status: '在隊' }
    ])

    expect(stats).toMatchObject({
      totalMembers: 5,
      elementarySchoolTeamMembers: 2,
      juniorHighSchoolTeamMembers: 2,
      communityMembers: 1,
      coachMembers: 1
    })
    expect(stats.activeMemberIds).toEqual(new Set([
      'elementary-1',
      'legacy-elementary-1',
      'junior-high-1',
      'junior-high-2',
      'community-1',
      'coach-1'
    ]))
  })

  it('excludes departed and inactive members from every count', () => {
    const stats = buildDashboardMemberStats([
      { id: 'active-elementary', role: '校隊', training_program: 'chunggang_school_team', status: '在隊' },
      { id: 'departed-junior-high', role: '校隊', training_program: 'junior_high_school_team', status: '離隊' },
      { id: 'departed-community', role: '球員', status: '退隊' },
      { id: 'inactive-community', role: '球員', status: '在隊', is_inactive_or_graduated: true },
      { id: 'inactive-coach', role: '教練', status: '在隊', is_inactive_or_graduated: true }
    ])

    expect(stats).toMatchObject({
      totalMembers: 1,
      elementarySchoolTeamMembers: 1,
      juniorHighSchoolTeamMembers: 0,
      communityMembers: 0,
      coachMembers: 0
    })
    expect(stats.activeMemberIds).toEqual(new Set(['active-elementary']))
  })
})
