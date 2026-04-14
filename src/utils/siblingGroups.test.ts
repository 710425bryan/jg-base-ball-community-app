import { describe, expect, it } from 'vitest'
import {
  buildSiblingGroupMap,
  normalizeSiblingIds,
  resolveLinkedMemberIds
} from './siblingGroups'

describe('siblingGroups', () => {
  it('normalizes chained sibling links into a full family group', () => {
    const members = normalizeSiblingIds([
      { id: 'huang-1', sibling_ids: ['huang-2', 'huang-3'] },
      { id: 'huang-2', sibling_ids: ['huang-1'] },
      { id: 'huang-3', sibling_ids: ['huang-1'] },
      { id: 'solo', sibling_ids: [] }
    ])

    expect(members).toEqual([
      { id: 'huang-1', sibling_ids: ['huang-2', 'huang-3'] },
      { id: 'huang-2', sibling_ids: ['huang-1', 'huang-3'] },
      { id: 'huang-3', sibling_ids: ['huang-1', 'huang-2'] },
      { id: 'solo', sibling_ids: [] }
    ])
  })

  it('expands a single member_id quarterly fee record to the entire sibling group', () => {
    const siblingGroupMap = buildSiblingGroupMap([
      { id: 'liu-1', sibling_ids: ['liu-2'] },
      { id: 'liu-2', sibling_ids: ['liu-1'] }
    ])

    expect(
      resolveLinkedMemberIds(
        {
          member_id: 'liu-1',
          member_ids: null
        },
        siblingGroupMap
      )
    ).toEqual(['liu-1', 'liu-2'])
  })

  it('fills in missing family members when member_ids only contains part of the sibling group', () => {
    const siblingGroupMap = buildSiblingGroupMap([
      { id: 'huang-1', sibling_ids: ['huang-2', 'huang-3'] },
      { id: 'huang-2', sibling_ids: ['huang-1'] },
      { id: 'huang-3', sibling_ids: ['huang-1'] }
    ])

    expect(
      resolveLinkedMemberIds(
        {
          member_id: 'huang-1',
          member_ids: ['huang-1', 'huang-2']
        },
        siblingGroupMap
      )
    ).toEqual(['huang-1', 'huang-2', 'huang-3'])
  })
})
