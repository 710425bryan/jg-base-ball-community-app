import { describe, expect, it } from 'vitest'
import { normalizeSiblingIds } from './siblingGroups'
import { shouldApplyManualHalfPrice } from './memberLifecycle'
import { getVisiblePlayerSiblingIds, mergeVisiblePlayerSiblingIds } from './playerRosterSiblings'

describe('filtered player roster sibling references', () => {
  it('does not restore stale manual half price when a deleted sibling is hidden', () => {
    const active = { id: 'active', name: '在隊球員', role: '球員', status: '在隊', is_half_price: true, sibling_ids: ['deleted'] }
    const deleted = { id: 'deleted', name: '已刪除姓名', role: '球員', status: '退隊', is_half_price: false, sibling_ids: ['active'], deleted_at: '2026-10-13' }
    const completeRoster = [active, deleted]
    expect(shouldApplyManualHalfPrice(active, completeRoster)).toBe(false)

    const visibleRoster = [active]
    const visibleIds = new Set(visibleRoster.map((member) => member.id))
    const normalized = normalizeSiblingIds(visibleRoster)
    expect(normalized[0]!.sibling_ids).toEqual([])
    const displayed = normalized.map((member) => ({
      ...member,
      sibling_ids: mergeVisiblePlayerSiblingIds(active.sibling_ids, member.sibling_ids, visibleIds)
    }))

    expect(shouldApplyManualHalfPrice(displayed[0]!, displayed)).toBe(false)
    expect(displayed).toEqual([active])
    expect(getVisiblePlayerSiblingIds(displayed[0]!.sibling_ids, visibleIds)).toEqual([])
    expect(displayed.some((member) => member.name === deleted.name)).toBe(false)
    expect(normalizeSiblingIds(completeRoster)).toEqual(completeRoster)
  })

  it('keeps hidden IDs in the saved draft when visible selections are cleared or changed', () => {
    const visibleIds = new Set(['active', 'visible-sibling', 'new-sibling'])
    const originalIds = ['deleted', 'visible-sibling']
    expect(getVisiblePlayerSiblingIds(originalIds, visibleIds)).toEqual(['visible-sibling'])
    expect(mergeVisiblePlayerSiblingIds(originalIds, [], visibleIds)).toEqual(['deleted'])
    expect(mergeVisiblePlayerSiblingIds(originalIds, ['new-sibling'], visibleIds)).toEqual(['new-sibling', 'deleted'])
    expect(originalIds).toEqual(['deleted', 'visible-sibling'])
  })

  it('preserves visible normalization while refusing newly submitted invisible IDs', () => {
    const visibleIds = new Set(['a', 'b', 'c'])
    expect(mergeVisiblePlayerSiblingIds(['b', 'deleted', 'deleted', '', null], ['b', 'c', 'unknown'], visibleIds))
      .toEqual(['b', 'c', 'deleted'])
    expect(mergeVisiblePlayerSiblingIds(null, ['b'], visibleIds)).toEqual(['b'])
  })
})
