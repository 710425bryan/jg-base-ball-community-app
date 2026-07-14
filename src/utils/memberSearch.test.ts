import { describe, expect, it } from 'vitest'

import { matchesMemberSearch } from './memberSearch'

describe('matchesMemberSearch', () => {
  const memberValues = ['王小明', '球員', 'U12熊戰組', 10]

  it('matches name, group, role, and jersey number', () => {
    expect(matchesMemberSearch('小明', memberValues)).toBe(true)
    expect(matchesMemberSearch('U12', memberValues)).toBe(true)
    expect(matchesMemberSearch('#10', memberValues)).toBe(true)
  })

  it('supports multiple terms across different member fields', () => {
    expect(matchesMemberSearch('王 U12 １０', memberValues)).toBe(true)
    expect(matchesMemberSearch('王 U13', memberValues)).toBe(false)
  })

  it('treats an empty query as no filtering', () => {
    expect(matchesMemberSearch('  ', memberValues)).toBe(true)
  })
})
