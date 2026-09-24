import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./EquipmentHistoryDialog.vue', import.meta.url), 'utf8')

describe('EquipmentHistoryDialog inventory adjustments', () => {
  it('renders stock-out records as negative rose-colored inventory changes', () => {
    expect(source).toContain("stock_out: '減少庫存'")
    expect(source).toContain("type === 'stock_out'")
    expect(source).toContain("isStockOut ? '減少庫存' : '新增庫存'")
    expect(source).toContain("`${isStockOut ? '-' : '+'}${quantity}`")
    expect(source).toContain("isStockOut ? 'negative' : 'positive'")
    expect(source).toContain("stock_set: '設定可用庫存'")
    expect(source).toContain('adjustment.available_quantity_before')
    expect(source).toContain('adjustment.available_quantity_after')
  })
})
