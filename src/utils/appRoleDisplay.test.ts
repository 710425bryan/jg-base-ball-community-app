import { describe, expect, it } from 'vitest'
import { getAppRoleDisplayName } from './appRoleDisplay'

describe('getAppRoleDisplayName', () => {
  it('uses the saved name for system and custom role keys without changing their identity', () => {
    const roles = [
      { role_key: 'ADMIN', role_name: '網站管理團隊' },
      { role_key: 'VOLUNTEER', role_name: '活動志工' }
    ]
    expect(getAppRoleDisplayName('ADMIN', roles, '系統管理員')).toBe('網站管理團隊')
    expect(getAppRoleDisplayName('VOLUNTEER', roles, 'VOLUNTEER')).toBe('活動志工')
    expect(roles.map((role) => role.role_key)).toEqual(['ADMIN', 'VOLUNTEER'])
  })

  it('matches only the exact key, never a display name or a similarly spelled key', () => {
    const roles = [{ role_key: 'ADMIN', role_name: 'COACH' }]
    expect(getAppRoleDisplayName('COACH', roles, '教練')).toBe('教練')
    expect(getAppRoleDisplayName('admin', roles, 'admin')).toBe('admin')
  })

  it('preserves the caller fallback while role metadata is missing or blank', () => {
    expect(getAppRoleDisplayName('MANAGER', [], '經理')).toBe('經理')
    expect(getAppRoleDisplayName(undefined, [], '尚未設定')).toBe('尚未設定')
    expect(getAppRoleDisplayName('ADMIN', [{ role_key: 'ADMIN', role_name: '  ' }], '系統管理員')).toBe('系統管理員')
  })
})
