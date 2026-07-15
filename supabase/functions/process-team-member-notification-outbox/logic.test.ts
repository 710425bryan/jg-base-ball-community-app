import { describe, expect, it } from 'vitest'

import {
  clampBatchLimit,
  getDeliveryFailureDisposition,
  getOutboxDispatchStatus,
  mapWithConcurrency,
} from './logic'

describe('team member notification outbox logic', () => {
  it('clamps requested event and delivery batch limits', () => {
    expect(clampBatchLimit(0, 25, 25)).toBe(1)
    expect(clampBatchLimit(40, 25, 25)).toBe(25)
    expect(clampBatchLimit('80', 100, 100)).toBe(80)
    expect(clampBatchLimit('invalid', 25, 25)).toBe(25)
  })

  it('uses the configured retry schedule and stops after six attempts', () => {
    const now = new Date('2026-07-15T00:00:00.000Z')

    expect(getDeliveryFailureDisposition(1, now)).toEqual({
      status: 'pending',
      nextAttemptAt: '2026-07-15T00:01:00.000Z',
    })
    expect(getDeliveryFailureDisposition(2, now).nextAttemptAt).toBe('2026-07-15T00:05:00.000Z')
    expect(getDeliveryFailureDisposition(3, now).nextAttemptAt).toBe('2026-07-15T00:15:00.000Z')
    expect(getDeliveryFailureDisposition(4, now).nextAttemptAt).toBe('2026-07-15T01:00:00.000Z')
    expect(getDeliveryFailureDisposition(5, now).nextAttemptAt).toBe('2026-07-15T06:00:00.000Z')
    expect(getDeliveryFailureDisposition(6, now)).toEqual({
      status: 'failed',
      nextAttemptAt: now.toISOString(),
    })
  })

  it('distinguishes no targets, retrying, partial and terminal outcomes', () => {
    expect(getOutboxDispatchStatus({ total: 0, pending: 0, sent: 0, failed: 0 })).toBe('no_targets')
    expect(getOutboxDispatchStatus({ total: 2, pending: 1, sent: 1, failed: 0 })).toBe('retrying')
    expect(getOutboxDispatchStatus({ total: 2, pending: 0, sent: 2, failed: 0 })).toBe('completed')
    expect(getOutboxDispatchStatus({ total: 2, pending: 0, sent: 1, failed: 1 })).toBe('partial_failed')
    expect(getOutboxDispatchStatus({ total: 2, pending: 0, sent: 0, failed: 2 })).toBe('failed')
  })

  it('keeps delivery concurrency bounded while preserving result order', async () => {
    let active = 0
    let maximumActive = 0

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await Promise.resolve()
      active -= 1
      return value * 10
    })

    expect(maximumActive).toBeLessThanOrEqual(2)
    expect(results).toEqual([10, 20, 30, 40, 50])
  })
})
