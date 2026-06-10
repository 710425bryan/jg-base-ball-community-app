import { describe, expect, it } from 'vitest'
import {
  buildSiblingHalfPriceCleanupIds,
  getActiveSiblingIds,
  isActiveRosterMember,
  shouldApplyManualHalfPrice
} from './memberLifecycle'

describe('memberLifecycle', () => {
  it('treats retired and inactive or graduated members as inactive roster members', () => {
    expect(isActiveRosterMember({ status: '在隊', is_inactive_or_graduated: false })).toBe(true)
    expect(isActiveRosterMember({ status: '退隊', is_inactive_or_graduated: false })).toBe(false)
    expect(isActiveRosterMember({ status: '離隊', is_inactive_or_graduated: false })).toBe(false)
    expect(isActiveRosterMember({ status: '在隊', is_inactive_or_graduated: true })).toBe(false)
  })

  it('returns only active sibling ids', () => {
    const members = [
      { id: 'active', role: '球員', status: '在隊', is_inactive_or_graduated: false, sibling_ids: ['closed', 'coach'] },
      { id: 'closed', role: '球員', status: '在隊', is_inactive_or_graduated: true, sibling_ids: ['active'] },
      { id: 'coach', role: '教練', status: '在隊', is_inactive_or_graduated: false, sibling_ids: ['active'] }
    ]

    expect(getActiveSiblingIds(members[0], members)).toEqual([])
  })

  it('clears the remaining sibling half-price flag when a two-player family has one inactive member', () => {
    const members = [
      { id: 'primary', role: '球員', status: '在隊', is_inactive_or_graduated: true, sibling_ids: ['half'], is_half_price: false },
      { id: 'half', role: '球員', status: '在隊', is_inactive_or_graduated: false, sibling_ids: ['primary'], is_half_price: true }
    ]

    expect(buildSiblingHalfPriceCleanupIds('primary', members)).toEqual(['half'])
  })

  it('does not apply a stale sibling half-price flag when no active sibling remains', () => {
    const members = [
      { id: 'active', role: '球員', status: '在隊', is_inactive_or_graduated: false, sibling_ids: ['closed'], is_half_price: true },
      { id: 'closed', role: '球員', status: '在隊', is_inactive_or_graduated: true, sibling_ids: ['active'], is_half_price: false }
    ]

    expect(shouldApplyManualHalfPrice(members[0], members)).toBe(false)
  })

  it('keeps manual half-price flags for members without sibling references', () => {
    const members = [
      { id: 'solo', role: '球員', status: '在隊', is_inactive_or_graduated: false, sibling_ids: [], is_half_price: true }
    ]

    expect(shouldApplyManualHalfPrice(members[0], members)).toBe(true)
  })

  it('keeps half-price flags when at least two active siblings remain', () => {
    const members = [
      { id: 'closed', role: '球員', status: '在隊', is_inactive_or_graduated: true, sibling_ids: ['primary', 'half'], is_half_price: false },
      { id: 'primary', role: '球員', status: '在隊', is_inactive_or_graduated: false, sibling_ids: ['closed', 'half'], is_half_price: false },
      { id: 'half', role: '球員', status: '在隊', is_inactive_or_graduated: false, sibling_ids: ['closed', 'primary'], is_half_price: true }
    ]

    expect(buildSiblingHalfPriceCleanupIds('closed', members)).toEqual([])
  })
})
