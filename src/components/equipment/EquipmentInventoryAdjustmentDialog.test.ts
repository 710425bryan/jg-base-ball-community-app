import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./EquipmentInventoryAdjustmentDialog.vue', import.meta.url), 'utf8')

describe('EquipmentInventoryAdjustmentDialog', () => {
  it('submits stock-out as a signed delta with a reason and confirmation', () => {
    expect(source).toContain("adjustmentType: 'stock_in'")
    expect(source).toContain("props.adjustmentType === 'stock_out'")
    expect(source).toContain('getSignedEquipmentInventoryAdjustmentQuantity(')
    expect(source).toContain("callback(new Error('請填寫減少庫存原因'))")
    expect(source).toContain("await ElMessageBox.confirm(")
    expect(source).toContain(':danger="isStockOut"')
  })

  it('limits reductions to currently available overall and size stock', () => {
    expect(source).toContain('getEquipmentInventoryReductionLimit(props.equipment, selectedSize.value)')
    expect(source).toContain('目前最多可減少')
    expect(source).toContain(':disabled="isStockOut && getSizeOptionReductionLimit(item.size) <= 0"')
    expect(source).toContain(':confirm-disabled="isQuantityInputDisabled"')
  })

  it('uses the shared responsive dialog footer', () => {
    expect(source).toContain("import AppDialogFooter from '@/components/common/AppDialogFooter.vue'")
    expect(source).toContain('<AppDialogFooter')
  })
})
