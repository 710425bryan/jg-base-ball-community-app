import { describe, expect, it } from 'vitest'
import {
  buildGroupedPushEventKey,
  buildPushEventKey,
  describePushDispatchIssue
} from './pushNotifications'

describe('pushNotifications', () => {
  it('builds a deterministic single-record event key', () => {
    expect(buildPushEventKey('team_member', 'abc-123')).toBe('team_member:abc-123')
  })

  it('builds a deterministic grouped event key', () => {
    expect(buildGroupedPushEventKey('quarterly_fee', ['fee-2', 'fee-1', 'fee-2', null, undefined]))
      .toBe('quarterly_fee:fee-1,fee-2')
  })

  it('describes missing push targets', () => {
    expect(describePushDispatchIssue({
      success: true,
      total_targets: 0,
      dispatched_count: 0,
      expired_count: 0,
      failed_count: 0,
      provider_counts: {}
    })).toContain('沒有已啟用推播的接收裝置')
  })

  it('returns null when at least one device receives push', () => {
    expect(describePushDispatchIssue({
      success: true,
      total_targets: 2,
      dispatched_count: 1,
      expired_count: 0,
      failed_count: 1,
      provider_counts: {}
    })).toBeNull()
  })
})
