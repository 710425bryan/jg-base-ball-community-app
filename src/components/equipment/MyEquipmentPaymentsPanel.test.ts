import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./MyEquipmentPaymentsPanel.vue', import.meta.url), 'utf8')

describe('MyEquipmentPaymentsPanel admin notification route', () => {
  it('deep-links submitted equipment payments to the independent review workspace', () => {
    expect(source).toContain("import { buildEquipmentAdminUrl } from '@/utils/equipmentPurchaseAdmin'")
    expect(source).toContain("recordType: 'payment_submission'")
    expect(source).not.toContain('url: `/fees?tab=equipment')
  })
})
