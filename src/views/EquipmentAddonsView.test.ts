import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./EquipmentAddonsView.vue', import.meta.url), 'utf8')

describe('EquipmentAddonsView admin notification route', () => {
  it('routes new purchase requests to the independent fees-owned workspace', () => {
    expect(source).toContain("import { buildEquipmentAdminUrl } from '@/utils/equipmentPurchaseAdmin'")
    expect(source).toContain("area: 'requests'")
    expect(source).toContain("status: 'pending'")
    expect(source).toContain("recordType: 'request'")
    expect(source).toContain("feature: 'fees'")
    expect(source).not.toContain('url: `/fees?tab=equipment')
  })
})
