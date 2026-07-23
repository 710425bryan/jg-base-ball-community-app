import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./EquipmentView.vue', import.meta.url), 'utf8')

describe('EquipmentView inventory adjustment actions', () => {
  it('offers stock-out only to equipment editors and passes the mode to the dialog', () => {
    expect(source.match(/openInventoryDialog\(equipment, 'stock_out'\)/g)).toHaveLength(2)
    expect(source.match(/v-if="canEdit"[^>]*openInventoryDialog\(equipment, 'stock_out'\)/g)).toHaveLength(2)
    expect(source).toContain(':adjustment-type="inventoryAdjustmentType"')
    expect(source).toContain('減少庫存')
  })
})
