import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canChangeCoachLeave, createCoachLeaveRequestId, getTaiwanToday, isActiveCoachProfile,
  normalizeCoachLeaveError, normalizeCoachLeaveList, validateCoachLeaveInput
} from './coachLeaveRequests'
import type { CoachLeaveRequest, CoachLeaveSaveInput } from '@/types/coachLeaveRequest'

const input: CoachLeaveSaveInput = {
  start_date: '2026-10-02', end_date: '2026-10-02', time_segment: 'morning', reason: null
}

describe('coach leave rules and normalization', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('accepts only coach profile roles and rejects suspended or out-of-window actors', () => {
    const now = '2026-10-02T04:00:00Z'
    for (const role of ['COACH', ' head_coach ', '總教練', ' 教練 ']) {
      expect(isActiveCoachProfile({ role }, now)).toBe(true)
    }
    expect(isActiveCoachProfile({ role: 'ADMIN' }, now)).toBe(false)
    expect(isActiveCoachProfile({ role: 'COACH', is_active: false }, now)).toBe(false)
    expect(isActiveCoachProfile({ role: 'COACH', access_start: '2026-11-01' }, now)).toBe(false)
    expect(isActiveCoachProfile({ role: 'COACH', access_end: '2026-09-30' }, now)).toBe(false)
    expect(isActiveCoachProfile(null, now)).toBe(false)
  })

  it('uses Taiwan today across UTC midnight without imposing a half-day submission cutoff', () => {
    expect(getTaiwanToday(new Date('2026-10-01T16:01:00Z'))).toBe('2026-10-02')
    expect(getTaiwanToday(new Date('2026-10-01T15:59:00Z'))).toBe('2026-10-01')
    expect(validateCoachLeaveInput(input, false, '2026-10-02')).toEqual({})
  })

  it('rejects invalid dates, past dates, reverse ranges, multi-day half days and missing management targets', () => {
    expect(validateCoachLeaveInput({ ...input, start_date: '2026-02-30' }, false, '2026-10-02')).toHaveProperty('start_date')
    expect(validateCoachLeaveInput({ ...input, start_date: '2026-10-01' }, false, '2026-10-02')).toHaveProperty('start_date')
    expect(validateCoachLeaveInput({ ...input, end_date: '2026-10-01' }, false, '2026-10-02')).toHaveProperty('end_date')
    expect(validateCoachLeaveInput({ ...input, end_date: '2026-10-03' }, false, '2026-10-02')).toHaveProperty('time_segment')
    expect(validateCoachLeaveInput(input, true, '2026-10-02')).toHaveProperty('coach_profile_id')
    expect(validateCoachLeaveInput({ ...input, reason: '字'.repeat(501) }, false, '2026-10-02')).toHaveProperty('reason')
    expect(validateCoachLeaveInput({ ...input, coach_profile_id: 'coach-a', end_date: '2026-10-03', time_segment: 'full_day' }, true, '2026-10-02')).toEqual({})
  })

  it('allows ongoing leave changes while keeping cancelled and fully ended requests immutable', () => {
    const leave = { status: 'active', start_date: '2026-10-01', end_date: '2026-10-03' } as CoachLeaveRequest
    expect(canChangeCoachLeave(leave, '2026-10-02')).toBe(true)
    expect(canChangeCoachLeave(leave, '2026-10-03')).toBe(true)
    expect(canChangeCoachLeave({ ...leave, status: 'cancelled' }, '2026-10-02')).toBe(false)
    expect(canChangeCoachLeave(leave, '2026-10-04')).toBe(false)
  })

  it('preserves profile UUID ownership and exact revision strings when normalizing RPC JSON', () => {
    const revision = '2026-10-02T06:00:00.123456+00:00'
    const value = normalizeCoachLeaveList(JSON.stringify({
      leaves: [{ id: 'leave-1', coach_profile_id: 'coach-a', coach_name: '阿明', start_date: '2026-10-02', end_date: '2026-10-02', time_segment: 'afternoon', updated_at: revision }, { id: '' }],
      coaches: [{ id: 'coach-a', name: '阿明', role: 'COACH' }]
    }))
    expect(value.leaves).toHaveLength(1)
    expect(value.leaves[0]).toMatchObject({ coach_profile_id: 'coach-a', updated_at: revision, time_segment: 'afternoon' })
    expect(value.coaches[0]?.id).toBe('coach-a')
    expect(normalizeCoachLeaveList('broken')).toEqual({ leaves: [], coaches: [] })
  })

  it('generates a retry UUID even when older WebViews lack randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(11) })
    expect(createCoachLeaveRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('shows useful stale and undeployed RPC errors instead of raw schema diagnostics', () => {
    expect(normalizeCoachLeaveError({ message: 'stale revision' })).toContain('重新整理')
    expect(normalizeCoachLeaveError({ message: 'Could not find the function public.list_coach_leave_requests' })).toContain('尚未部署')
  })
})
