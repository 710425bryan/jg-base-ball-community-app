import { describe, expect, it } from 'vitest'
import {
  canSubmitTrainingRegistration,
  getTrainingRegistrationBlockReason,
  normalizeTrainingSelectedMembers
} from './training'
import type { TrainingSession } from '@/types/training'

type TrainingRuleSession = Pick<
  TrainingSession,
  | 'session_id'
  | 'manual_status'
  | 'is_registration_open'
  | 'is_blocked'
  | 'block_reason'
  | 'point_cost'
  | 'registration_status'
>

const buildSession = (overrides: Partial<TrainingRuleSession> = {}): TrainingRuleSession => ({
  session_id: 'session-1',
  manual_status: 'open',
  is_registration_open: true,
  is_blocked: false,
  block_reason: null,
  point_cost: 1,
  registration_status: null,
  ...overrides
})

describe('training helpers', () => {
  it('allows registration only when the session is open and the member has enough available points', () => {
    expect(canSubmitTrainingRegistration(buildSession(), 1)).toBe(true)
    expect(canSubmitTrainingRegistration(buildSession({ is_registration_open: false }), 1)).toBe(false)
    expect(canSubmitTrainingRegistration(buildSession({ is_blocked: true }), 1)).toBe(false)
    expect(canSubmitTrainingRegistration(buildSession({ registration_status: 'applied' }), 1)).toBe(false)
    expect(canSubmitTrainingRegistration(buildSession({ point_cost: 2 }), 1)).toBe(false)
  })

  it('returns the most actionable reason when a member cannot register', () => {
    expect(getTrainingRegistrationBlockReason(buildSession({ is_blocked: true, block_reason: '下一場禁報' }), 5))
      .toBe('下一場禁報')
    expect(getTrainingRegistrationBlockReason(buildSession({ manual_status: 'paused', is_registration_open: false }), 5))
      .toBe('教練已暫停報名')
    expect(getTrainingRegistrationBlockReason(buildSession({ point_cost: 3 }), 2))
      .toBe('點數不足')
  })

  it('normalizes published selected members defensively', () => {
    expect(normalizeTrainingSelectedMembers([
      { member_id: 'm1', name: '王小明', jersey_number: 7 },
      { member_id: '', name: '缺資料' },
      null
    ])).toEqual([
      {
        member_id: 'm1',
        name: '王小明',
        role: null,
        team_group: null,
        jersey_number: 7
      }
    ])
  })
})
