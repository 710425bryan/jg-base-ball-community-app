import { describe, expect, it } from 'vitest'
import { compareUserRoleKeys, getRoleWeight, getUserRoleOrder, sortUserRoles } from './userRoleOrder'

const roles = [
  { role_key: 'MEMBER', role_name: '一般成員', weight: 99 },
  { role_key: 'ADMIN', role_name: '系統管理員', weight: 1 },
  { role_key: 'FINANCE', role_name: '財務', weight: 20 },
  { role_key: 'MANAGER', role_name: '管理員', weight: 9 },
  { role_key: 'HEAD_COACH', role_name: '總教練', weight: 10 },
  { role_key: 'SCHEDULINGCOACH', role_name: '排班教練', weight: 15 },
  { role_key: 'COACH', role_name: '教練', weight: 16 },
  { role_key: 'COMMITTEE', role_name: '委員', weight: 21 }
]
const defaultOrder = ['ADMIN', 'MANAGER', 'HEAD_COACH', 'SCHEDULINGCOACH', 'COACH', 'FINANCE', 'COMMITTEE', 'MEMBER']

describe('userRoleOrder', () => {
  it('orders all eight roles by their saved numeric weights and leaves the input unchanged', () => {
    const before = structuredClone(roles)
    expect([...getUserRoleOrder(roles).keys()]).toEqual(defaultOrder)
    expect(roles).toEqual(before)
  })

  it('respects manual weights instead of pinning scheduling coaches after head coaches', () => {
    const changed = roles.map((role) => role.role_key === 'SCHEDULINGCOACH' ? { ...role, weight: 5 } : role)
    expect([...getUserRoleOrder(changed).keys()]).toEqual([
      'ADMIN', 'SCHEDULINGCOACH', 'MANAGER', 'HEAD_COACH', 'COACH', 'FINANCE', 'COMMITTEE', 'MEMBER'
    ])
  })

  it('also lets ADMIN move through a manual weight without affecting other roles', () => {
    const changed = roles.map((role) => role.role_key === 'ADMIN' ? { ...role, weight: 100 } : role)
    expect(sortUserRoles(changed).at(-1)?.role_key).toBe('ADMIN')
  })

  it('breaks equal weights by role key consistently across fetch orders and names', () => {
    const tied = [
      { role_key: 'Z_CUSTOM', role_name: '排班教練', weight: 16 },
      { role_key: 'A_CUSTOM', role_name: '總教練', weight: 16 },
      { role_key: 'COACH', role_name: '教練', weight: 16 }
    ]
    expect(sortUserRoles(tied).map((role) => role.role_key)).toEqual(['A_CUSTOM', 'COACH', 'Z_CUSTOM'])
    expect(sortUserRoles([...tied].reverse())).toEqual(sortUserRoles(tied))
  })

  it.each([undefined, null, 0, -1, NaN, 1.5])('uses 99 for a missing or invalid weight %s', (weight) => {
    expect(getRoleWeight({ role_key: 'CUSTOM', weight })).toBe(99)
  })

  it('keeps the requested default priority before role metadata loads', () => {
    expect([...getUserRoleOrder([]).keys()]).toEqual(defaultOrder)
  })

  it('sorts user groups missing role metadata at 99, before known weights over 99', () => {
    const weights = getUserRoleOrder([{ role_key: 'ADMIN', weight: 1 }, { role_key: 'LATE', weight: 150 }])
    expect(['LATE', 'UNKNOWN', 'ADMIN'].sort((a, b) => compareUserRoleKeys(a, b, weights))).toEqual(['ADMIN', 'UNKNOWN', 'LATE'])
    expect(weights.get('LATE')).toBe(150)
  })
})
