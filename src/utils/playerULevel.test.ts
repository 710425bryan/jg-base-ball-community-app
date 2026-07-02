import { describe, expect, it } from 'vitest'
import { inferPlayerULevelFromBirthDate } from './playerULevel'

describe('playerULevel', () => {
  it('advances U-level when this year birthday has arrived', () => {
    expect(inferPlayerULevelFromBirthDate('2014-02-10', { today: '2026-07-02' })).toBe('U13')
    expect(inferPlayerULevelFromBirthDate('2014-07-02', { today: '2026-07-02' })).toBe('U13')
  })

  it('keeps current age U-level before this year birthday', () => {
    expect(inferPlayerULevelFromBirthDate('2014-12-10', { today: '2026-07-02' })).toBe('U12')
  })

  it('floors younger players at U8', () => {
    expect(inferPlayerULevelFromBirthDate('2020-02-10', { today: '2026-07-02' })).toBe('U8')
  })

  it('returns an empty label for missing or invalid dates', () => {
    expect(inferPlayerULevelFromBirthDate(null, { today: '2026-07-02' })).toBe('')
    expect(inferPlayerULevelFromBirthDate('not-a-date', { today: '2026-07-02' })).toBe('')
  })
})
