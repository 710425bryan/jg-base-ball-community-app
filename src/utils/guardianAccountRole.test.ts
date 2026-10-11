import { describe, expect, it } from 'vitest'
import { GENERAL_MEMBER_ROLE_FALLBACK, resolveGeneralMemberRoleKeyFromRoles } from './guardianAccountRole'

describe('guardianAccountRole', () => {
  it('retains the member role after its display name changes', () => {
    const roles = [
      { role_key: 'ADMIN', role_name: '一般成員' },
      { role_key: 'MEMBER', role_name: '球員家長' }
    ]

    expect(resolveGeneralMemberRoleKeyFromRoles(roles)).toBe('MEMBER')
  })

  it('never chooses a privileged or custom key just because its display name is 一般成員', () => {
    const roles = [
      { role_key: 'ADMIN', role_name: '一般成員' },
      { role_key: 'CUSTOM', role_name: '一般成員' }
    ]

    expect(resolveGeneralMemberRoleKeyFromRoles(roles)).toBe('')
  })

  it.each([
    [['GENERAL_MEMBER', 'PARENT', 'MEMBER'], 'MEMBER'],
    [['GENERAL_MEMBER', 'PARENT'], 'PARENT'],
    [['GENERAL_MEMBER'], 'GENERAL_MEMBER']
  ])('preserves candidate priority for %j', (keys, expected) => {
    expect(resolveGeneralMemberRoleKeyFromRoles(keys.map((role_key) => ({ role_key })))).toBe(expected)
  })

  it('keeps an empty result for stale role lists so the view can retry before falling back to MEMBER', () => {
    expect(resolveGeneralMemberRoleKeyFromRoles([])).toBe('')
    expect(GENERAL_MEMBER_ROLE_FALLBACK).toBe('MEMBER')
  })
})
