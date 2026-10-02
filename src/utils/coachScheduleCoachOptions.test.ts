import { describe, expect, it } from 'vitest'
import type { SchedulableCoach } from '@/types/coachSchedule'
import { buildCoachScheduleCoachGroups, type CoachScheduleCoachRole } from './coachScheduleCoachOptions'

const coach = (id: string, role: string, name = id, nickname: string | null = null): SchedulableCoach => ({
  id, role, name, nickname, avatar_url: null
})
const roles: CoachScheduleCoachRole[] = [
  { role_key: 'HEAD_COACH', role_name: '總教練', weight: 10 },
  { role_key: 'COACH', role_name: '教練', weight: 16 }
]

describe('coachScheduleCoachOptions', () => {
  it('groups only the supplied coaches and orders groups by the saved role weights', () => {
    const coaches = [coach('coach-b', 'COACH'), coach('head', 'HEAD_COACH'), coach('coach-a', 'COACH')]
    const groups = buildCoachScheduleCoachGroups(coaches, roles)
    expect(groups.map((group) => [group.key, group.label])).toEqual([['HEAD_COACH', '總教練'], ['COACH', '教練']])
    expect(groups.flatMap((group) => group.coaches.map((row) => row.id))).toEqual(['head', 'coach-a', 'coach-b'])
    expect(groups.flatMap((group) => group.coaches)).toHaveLength(coaches.length)
    expect(buildCoachScheduleCoachGroups(coaches, [{ ...roles[0]!, weight: 20 }, { ...roles[1]!, weight: 5 }])
      .map((group) => group.key)).toEqual(['COACH', 'HEAD_COACH'])
  })

  it('breaks equal role weights by canonical keys rather than display names or input order', () => {
    const equalRoles = [{ role_key: 'HEAD_COACH', role_name: '最前面的名稱', weight: 7 },
      { role_key: 'COACH', role_name: '最後面的名稱', weight: 7 }]
    const coaches = [coach('h', 'HEAD_COACH'), coach('c', 'COACH')]
    expect(buildCoachScheduleCoachGroups(coaches, equalRoles).map((group) => group.key)).toEqual(['COACH', 'HEAD_COACH'])
    expect(buildCoachScheduleCoachGroups([...coaches].reverse(), [...equalRoles].reverse()))
      .toEqual(buildCoachScheduleCoachGroups(coaches, equalRoles))
  })

  it('keeps scheduling coaches as their own role group between the saved head-coach and coach weights', () => {
    const candidates = [coach('coach', 'COACH'), coach('scheduler', 'SCHEDULINGCOACH'), coach('head', 'HEAD_COACH')]
    const groups = buildCoachScheduleCoachGroups(candidates, [
      ...roles, { role_key: 'SCHEDULINGCOACH', role_name: '排班教練', weight: 15 }
    ])
    expect(groups.map((group) => [group.key, group.label, group.coaches.map((row) => row.id)]))
      .toEqual([['HEAD_COACH', '總教練', ['head']], ['SCHEDULINGCOACH', '排班教練', ['scheduler']], ['COACH', '教練', ['coach']]])
    expect(groups[1]!.coaches[0]).toBe(candidates[1])
  })

  it('reflects role renaming and reordered weights on the next build without pinning a role label', () => {
    const coaches = [coach('h', 'HEAD_COACH'), coach('c', 'COACH')]
    const first = buildCoachScheduleCoachGroups(coaches, roles)
    const changed = roles.map((role) => role.role_key === 'COACH'
      ? { ...role, weight: 1, role_name: ' 排班教練 ' }
      : { ...role, role_name: '資深教練' })
    expect(buildCoachScheduleCoachGroups(coaches, changed).map((group) => [group.key, group.label]))
      .toEqual([['COACH', '排班教練'], ['HEAD_COACH', '資深教練']])
    expect(first.map((group) => group.label)).toEqual(['總教練', '教練'])
  })

  it('merges trimmed lowercase and historical Chinese coach roles into the canonical groups', () => {
    const coaches = [coach('head-a', ' head_coach '), coach('head-b', ' 總教練 '),
      coach('coach-a', ' coach '), coach('coach-b', ' 教練 ')]
    const groups = buildCoachScheduleCoachGroups(coaches, [
      { role_key: ' head_coach ', role_name: '總指導', weight: 2 }, { role_key: 'COACH', role_name: '固定教練', weight: 3 }
    ])
    expect(groups.map((group) => [group.key, group.label, group.coaches.map((row) => row.id)]))
      .toEqual([['HEAD_COACH', '總指導', ['head-a', 'head-b']], ['COACH', '固定教練', ['coach-a', 'coach-b']]])
  })

  it('keeps unknown and blank roles without adding candidates and uses the shared missing-weight order', () => {
    const coaches = [coach('late', 'LATE'), coach('custom', ' assistant '), coach('blank', '  '), coach('head', 'HEAD_COACH')]
    const groups = buildCoachScheduleCoachGroups(coaches, [{ role_key: 'LATE', role_name: '支援教練', weight: 150 }, roles[0]!])
    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ['HEAD_COACH', '總教練'], ['', '其他教練'], ['ASSISTANT', 'ASSISTANT'], ['LATE', '支援教練']
    ])
    expect(groups.flatMap((group) => group.coaches).map((row) => row.id).sort()).toEqual(coaches.map((row) => row.id).sort())
    expect(buildCoachScheduleCoachGroups([coach('c', 'COACH'), coach('h', 'HEAD_COACH')], [])
      .map((group) => [group.key, group.label])).toEqual([['HEAD_COACH', '總教練'], ['COACH', '教練']])
  })

  it('falls back from empty metadata labels and invalid weights without using names as role priority', () => {
    const groups = buildCoachScheduleCoachGroups([coach('c', 'COACH'), coach('h', 'HEAD_COACH'), coach('u', 'CUSTOM')], [
      { role_key: 'HEAD_COACH', role_name: '  ', weight: null },
      { role_key: 'COACH', role_name: '', weight: 0 }, { role_key: 'CUSTOM', role_name: '排班教練', weight: -1 }
    ])
    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ['COACH', '教練'], ['CUSTOM', '排班教練'], ['HEAD_COACH', '總教練']
    ])
  })

  it('sorts within each group by nickname/name, then full name and ID for stable ties', () => {
    const coaches = [coach('tie-b', 'COACH', '同名', '共同暱稱'), coach('tie-a', 'COACH', '同名', '共同暱稱'),
      coach('name-b', 'COACH', 'B姓名', 'A暱稱'), coach('name-a', 'COACH', 'A姓名', 'A暱稱'),
      coach('first', 'COACH', '0姓名'), coach('fallback', 'COACH', 'Z姓名', '')]
    const group = buildCoachScheduleCoachGroups(coaches, roles)[0]!
    expect(group.coaches.map((row) => row.id)).toEqual(['first', 'tie-a', 'tie-b', 'name-a', 'name-b', 'fallback'])
    expect(buildCoachScheduleCoachGroups([...coaches].reverse(), roles)[0]!.coaches).toEqual(group.coaches)
  })

  it('returns no empty groups and leaves frozen input arrays and coach/role objects untouched', () => {
    const coaches = Object.freeze([Object.freeze(coach('b', ' 教練 ')), Object.freeze(coach('a', 'COACH'))])
    const metadata = Object.freeze(roles.map((role) => Object.freeze({ ...role })))
    const before = JSON.stringify({ coaches, metadata })
    const groups = buildCoachScheduleCoachGroups(coaches, metadata)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.coaches.map((row) => row.id)).toEqual(['a', 'b'])
    groups[0]!.coaches.reverse()
    expect(JSON.stringify({ coaches, metadata })).toBe(before)
    expect(buildCoachScheduleCoachGroups([], metadata)).toEqual([])
    expect(buildCoachScheduleCoachGroups([], [])).toEqual([])
  })
})
