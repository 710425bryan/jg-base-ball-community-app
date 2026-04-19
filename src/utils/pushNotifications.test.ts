import { describe, expect, it } from 'vitest'
import { buildGroupedPushEventKey, buildPushEventKey } from './pushNotifications'

describe('pushNotifications', () => {
  it('builds a deterministic single-record event key', () => {
    expect(buildPushEventKey('team_member', 'abc-123')).toBe('team_member:abc-123')
  })

  it('builds a deterministic grouped event key', () => {
    expect(buildGroupedPushEventKey('quarterly_fee', ['fee-2', 'fee-1', 'fee-2', null, undefined]))
      .toBe('quarterly_fee:fee-1,fee-2')
  })
})
