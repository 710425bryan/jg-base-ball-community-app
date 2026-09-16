import { describe, expect, it } from 'vitest'
import { moveEquipment, sortEquipments } from './equipmentOrder'

describe('equipment display order', () => {
  const items = [
    { id: 'a', created_at: '2026-09-01T00:00:00Z' },
    { id: 'b', created_at: '2026-09-02T00:00:00Z' },
    { id: 'c', created_at: '2026-09-02T00:00:00Z' }
  ]
  it('uses the shared order, drops deleted IDs and appends new items deterministically', () => {
    expect(sortEquipments(items, ['deleted', 'c', 'a']).map(item => item.id)).toEqual(['c', 'a', 'b'])
    expect(sortEquipments(items, []).map(item => item.id)).toEqual(['b', 'c', 'a'])
    expect(items.map(item => item.id)).toEqual(['a', 'b', 'c'])
  })
  it('moves items in either direction without changing the source or dropping edge items', () => {
    expect(moveEquipment(items, 0, 2).map(item => item.id)).toEqual(['b', 'c', 'a'])
    expect(moveEquipment(items, 2, 0).map(item => item.id)).toEqual(['c', 'a', 'b'])
    for (const [from, to] of [[0, -1], [2, 3], [-1, 1], [0, 1.5]]) {
      expect(moveEquipment(items, from, to)).toEqual(items)
    }
  })
})
