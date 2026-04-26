import { describe, expect, it } from 'vitest'
import { getProfileAccessState, isProfileAccessAllowed } from './profileAccess'

describe('profileAccess', () => {
  const now = '2026-04-26T12:00:00.000Z'

  it('allows profiles without access restrictions', () => {
    const state = getProfileAccessState({ is_active: true }, now)

    expect(state).toMatchObject({
      allowed: true,
      status: 'active',
      label: '可登入'
    })
    expect(isProfileAccessAllowed({ is_active: true }, now)).toBe(true)
  })

  it('blocks suspended profiles', () => {
    const state = getProfileAccessState({ is_active: false }, now)

    expect(state).toMatchObject({
      allowed: false,
      status: 'suspended',
      label: '已停權'
    })
  })

  it('blocks profiles before the access window starts', () => {
    const state = getProfileAccessState({
      is_active: true,
      access_start: '2026-04-26T12:00:01.000Z'
    }, now)

    expect(state).toMatchObject({
      allowed: false,
      status: 'not_started',
      label: '尚未開始'
    })
  })

  it('blocks profiles after the access window ends', () => {
    const state = getProfileAccessState({
      is_active: true,
      access_end: '2026-04-26T11:59:59.000Z'
    }, now)

    expect(state).toMatchObject({
      allowed: false,
      status: 'expired',
      label: '已過期'
    })
  })

  it('treats start and end boundaries as inclusive', () => {
    expect(getProfileAccessState({
      is_active: true,
      access_start: now
    }, now).allowed).toBe(true)

    expect(getProfileAccessState({
      is_active: true,
      access_end: now
    }, now).allowed).toBe(true)
  })
})
