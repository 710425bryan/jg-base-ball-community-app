import { describe, expect, it } from 'vitest'
import {
  PLAYER_GRADE_OPTIONS,
  getAcademicYearStart,
  inferPlayerGradeFromBirthDate,
  normalizePlayerGrade
} from './playerGrade'

describe('playerGrade', () => {
  it('provides kindergarten through high school grade options', () => {
    expect(PLAYER_GRADE_OPTIONS[0]).toEqual({
      label: '幼稚園小班',
      value: '幼稚園小班'
    })
    expect(PLAYER_GRADE_OPTIONS.at(-1)).toEqual({
      label: '高中三年級',
      value: '高中三年級'
    })
  })

  it('switches academic years on September 1', () => {
    expect(getAcademicYearStart('2026-08-31')).toBe(2025)
    expect(getAcademicYearStart('2026-09-01')).toBe(2026)
  })

  it('infers elementary grade using the September 1 enrollment cutoff', () => {
    expect(inferPlayerGradeFromBirthDate('2018-09-01', { today: '2026-07-01' })).toBe('國小二年級')
    expect(inferPlayerGradeFromBirthDate('2018-09-02', { today: '2026-07-01' })).toBe('國小一年級')
    expect(inferPlayerGradeFromBirthDate('2019-09-01', { today: '2026-07-01' })).toBe('國小一年級')
    expect(inferPlayerGradeFromBirthDate('2019-09-02', { today: '2026-07-01' })).toBe('幼稚園大班')
  })

  it('moves September 2 or later birthdays up when marked as early enrollment', () => {
    expect(inferPlayerGradeFromBirthDate('2019-09-02', {
      isEarlyEnrollment: true,
      today: '2026-07-01'
    })).toBe('國小一年級')
  })

  it('infers kindergarten grades', () => {
    expect(inferPlayerGradeFromBirthDate('2021-09-02', { today: '2026-07-01' })).toBe('幼稚園小班')
    expect(inferPlayerGradeFromBirthDate('2020-09-02', { today: '2026-07-01' })).toBe('幼稚園中班')
    expect(inferPlayerGradeFromBirthDate('2019-09-02', { today: '2026-07-01' })).toBe('幼稚園大班')
  })

  it('normalizes common spreadsheet grade labels', () => {
    expect(normalizePlayerGrade('三年級')).toBe('國小三年級')
    expect(normalizePlayerGrade('國一')).toBe('國中一年級')
    expect(normalizePlayerGrade('國中二年級')).toBe('國中二年級')
    expect(normalizePlayerGrade('高一')).toBe('高中一年級')
    expect(normalizePlayerGrade('小班')).toBe('幼稚園小班')
  })
})
