import { describe, expect, it } from 'vitest'
import {
  CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY,
  JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY,
  getTrainingProgramFallbackSettings,
  getTrainingProgramKeyForMember,
  normalizeTrainingProgramSetting,
  normalizeTrainingProgramWeekdays
} from './trainingPrograms'

describe('trainingPrograms', () => {
  it('normalizes settings and weekday defaults', () => {
    expect(normalizeTrainingProgramWeekdays([0, 7, 0, 6])).toEqual([0, 6])
    expect(normalizeTrainingProgramWeekdays([])).toEqual([6])
    expect(normalizeTrainingProgramSetting({
      program_key: ' Junior High ',
      label: '國中校隊',
      default_weekdays: [0],
      is_active: true
    })).toMatchObject({
      program_key: 'junior_high',
      label: '國中校隊',
      default_weekdays: [0],
      is_active: true
    })
  })

  it('maps junior high team_group to junior high program', () => {
    expect(getTrainingProgramKeyForMember({
      role: '校隊',
      team_group: '國中校隊'
    }, getTrainingProgramFallbackSettings())).toBe(JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY)
  })

  it('uses member training_program before team_group fallback', () => {
    expect(getTrainingProgramKeyForMember({
      role: '校隊',
      team_group: 'U13熊戰組',
      training_program: JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY
    }, getTrainingProgramFallbackSettings())).toBe(JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY)
  })

  it('falls back old school team data to chunggang program', () => {
    expect(getTrainingProgramKeyForMember({
      role: '校隊',
      team_group: null
    }, getTrainingProgramFallbackSettings())).toBe(CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY)
  })

  it('falls back per-session monthly players but does not scope regular players', () => {
    expect(getTrainingProgramKeyForMember({
      role: '球員',
      team_group: null,
      fee_billing_mode: 'monthly_per_session'
    }, getTrainingProgramFallbackSettings())).toBe(CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY)

    expect(getTrainingProgramKeyForMember({
      role: '球員',
      team_group: null,
      fee_billing_mode: 'role_default'
    }, getTrainingProgramFallbackSettings())).toBeNull()
  })
})
