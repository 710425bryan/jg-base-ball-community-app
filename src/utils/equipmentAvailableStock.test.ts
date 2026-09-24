import { describe, expect, it } from 'vitest'
import { getEquipmentAvailableStockDraft, getEquipmentStockIssue, normalizeAvailableStock, hasAvailableQuantityChange, hasAvailableQuantityReduction } from './equipmentAvailableStock'

const equipment = {
  total_quantity: 9, sizes_stock: [{size:'S',quantity:1},{size:'M',quantity:8}],
  inventory_snapshot: [{equipment_id:'hat',size:'S',used_quantity:1,reserved_quantity:0},{equipment_id:'hat',size:'M',used_quantity:2,reserved_quantity:2}]
}
describe('available stock editing', () => {
  it('loads available counts without adding back already used or reserved items', () => {
    expect(getEquipmentAvailableStockDraft(equipment)).toEqual({ available_quantity:4, sizes:[{size:'S',quantity:0},{size:'M',quantity:4}] })
    expect(getEquipmentStockIssue(equipment)).toBe('')
    expect(equipment.sizes_stock[0].quantity).toBe(1)
  })
  it('derives sized availability and preserves first appearance when merging duplicates', () => {
    expect(normalizeAvailableStock({available_quantity:99,sizes:[{size:'M',quantity:2},{size:' S ',quantity:0},{size:'M',quantity:3}]}))
      .toEqual({available_quantity:5,sizes:[{size:'M',quantity:5},{size:'S',quantity:0}]})
  })
  it('rejects invalid quantities rather than silently discarding them', () => {
    for (const quantity of [-1,1.5,NaN,null]) {
      expect(() => normalizeAvailableStock({available_quantity:quantity as number,sizes:[]})).toThrow()
      expect(() => normalizeAvailableStock({available_quantity:0,sizes:[{size:'M',quantity:quantity as number}]})).toThrow()
    }
    expect(() => normalizeAvailableStock({available_quantity:0,sizes:[{size:'',quantity:1}]})).toThrow('尺寸名稱')
  })
  it('detects actual reductions including removed sizes but ignores ordering alone', () => {
    const before = getEquipmentAvailableStockDraft(equipment)
    const reordered = {...before,sizes:[...before.sizes].reverse()}
    expect(hasAvailableQuantityChange(before,reordered)).toBe(false)
    expect(hasAvailableQuantityReduction(before,reordered)).toBe(false)
    expect(hasAvailableQuantityReduction(before,{available_quantity:0,sizes:[{size:'S',quantity:0}]})).toBe(true)
  })
  it('flags legacy mismatches for reconciliation instead of silently adding inventory', () => {
    expect(getEquipmentStockIssue({...equipment,total_quantity:5})).toContain('不一致')
    expect(getEquipmentStockIssue({...equipment,sizes_stock:[{size:'S',quantity:0},{size:'M',quantity:9}]})).toContain('不一致')
    expect(getEquipmentStockIssue({...equipment,sizes_stock:[{size:'S(54cm)',quantity:1},{size:'M',quantity:8}]})).toContain('無法對應')
    expect(getEquipmentStockIssue({...equipment,total_quantity:0,sizes_stock:[]})).toContain('不一致')
  })
  it.each([
    [70, [20, 1, 60, 5, 3], [0, 1, 22, 3, 3], 41, 60],
    [22, [1, 6, 12, 2], [1, 6, 12, 2], 1, 0],
    [120, [2, 2, 4, 3, 2, 3, 2], [2, 1, 2, 2, 2, 3, 2], 106, 4],
    [120, [2, 5, 2, 1, 2, 2], [2, 4, 2, 1, 2, 2], 107, 1],
    [100, [20, 20, 20, 20, 20, 20], [0, 0, 0, 0, 0, 0], 100, 120],
    [92, [20, 36, 20, 13, 7, 6, 5, 5], [0, 8, 7, 2, 0, 1, 0, 0], 74, 94],
    [20, [10, 10, 10, 10, 10, 10], [0, 0, 1, 0, 1, 0], 18, 58]
  ])('explains an aggregate mismatch without changing stock (%s)', (total, quantities, used, available, sizeAvailable) => {
    const legacy = {
      total_quantity: total,
      sizes_stock: quantities.map((quantity, i) => ({ size: String(i), quantity })),
      inventory_snapshot: used.map((quantity, i) => ({equipment_id:'item',size:String(i),used_quantity:quantity,reserved_quantity:0}))
    }
    expect(getEquipmentStockIssue(legacy)).toContain(`目前可用 ${available} 件，各尺寸可用合計 ${sizeAvailable} 件，相差 ${Math.abs(available-sizeAvailable)} 件`)
    expect(getEquipmentAvailableStockDraft(legacy).available_quantity).toBe(available)
    expect(legacy.total_quantity).toBe(total)
  })
})
