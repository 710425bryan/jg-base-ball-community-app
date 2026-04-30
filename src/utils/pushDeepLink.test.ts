import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PUSH_DEEP_LINK_TARGET,
  buildPushEntryHash,
  normalizePushDeepLinkTarget
} from './pushDeepLink'

const origin = 'https://example.com'

describe('pushDeepLink', () => {
  it('keeps safe same-origin app routes', () => {
    expect(normalizePushDeepLinkTarget('/calendar?match_id=match-1', origin))
      .toBe('/calendar?match_id=match-1')
    expect(normalizePushDeepLinkTarget('training?session_id=session-1', origin))
      .toBe('/training?session_id=session-1')
  })

  it('converts legacy match detail targets to the schedule detail route', () => {
    expect(normalizePushDeepLinkTarget('/match-records?match_id=match-1', origin))
      .toBe('/calendar?match_id=match-1')
    expect(normalizePushDeepLinkTarget('https://example.com/#/match-records?match_id=match-2', origin))
      .toBe('/calendar?match_id=match-2')
  })

  it('blocks unsafe or recursive push entry targets', () => {
    expect(normalizePushDeepLinkTarget('https://evil.example/calendar', origin))
      .toBe(DEFAULT_PUSH_DEEP_LINK_TARGET)
    expect(normalizePushDeepLinkTarget('//evil.example/calendar', origin))
      .toBe(DEFAULT_PUSH_DEEP_LINK_TARGET)
    expect(normalizePushDeepLinkTarget('/push-entry?target=/calendar', origin))
      .toBe(DEFAULT_PUSH_DEEP_LINK_TARGET)
  })

  it('builds the hash entry used after reading push_target', () => {
    expect(buildPushEntryHash('/calendar?match_id=match-1'))
      .toBe('#/push-entry?target=%2Fcalendar%3Fmatch_id%3Dmatch-1')
  })
})
