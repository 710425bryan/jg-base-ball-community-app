import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./MyPaymentsView.vue', import.meta.url), 'utf8')

describe('MyPaymentsView equipment admin notification route', () => {
  it('deep-links submitted equipment payments to payment review', () => {
    expect(source).toContain("import { buildEquipmentAdminUrl } from '@/utils/equipmentPurchaseAdmin'")
    expect(source).toContain("area: 'payments'")
    expect(source).toContain("status: 'review'")
    expect(source).toContain("recordType: 'payment_submission'")
    expect(source).not.toContain('url: `/fees?tab=equipment')
  })
})

describe('MyPaymentsView match fee payment gate', () => {
  it('only counts and selects unpaid match fees while the match is open', () => {
    expect(source).toContain('getPayableMatchFeeItems(matchFeeItems.value)')
    expect(source).toContain('selectable: isMatchFeeItemPayable(item)')
    expect(source).toContain("isClosedHistory ? '已關閉'")
    expect(source).toContain('管理者重新開放前無法再次付款')
  })
})
