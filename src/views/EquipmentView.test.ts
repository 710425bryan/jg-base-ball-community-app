import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const catalog = readFileSync(new URL('../components/equipment/EquipmentCatalogList.vue', import.meta.url), 'utf8')

const source = readFileSync(new URL('./EquipmentView.vue', import.meta.url), 'utf8')

describe('EquipmentView inventory adjustment actions', () => {
  it('offers stock-out only to equipment editors and passes the mode to the dialog', () => {
    expect(catalog.match(/v-if="canEdit"[^>]*emit\('inventory', equipment, 'stock_out'\)/g)).toHaveLength(2)
    expect(source).toContain(':adjustment-type="inventoryAdjustmentType"')
    expect(catalog).toContain('減少庫存')
  })
})


it('opens sorting for editors with the entire catalog, while filtering only the displayed list', () => {
  expect(source).toContain("permissionsStore.can('equipment', 'EDIT')")
  expect(source).toMatch(/<button\s+v-if="canEdit"[\s\S]*?isOrderDialogOpen = true/)
  expect(source).toMatch(/<EquipmentOrderDialog\s+v-if="canEdit"[\s\S]*?:equipments="equipmentStore.equipments"/)
  expect(source).toContain(':equipments="filteredEquipments"')
  expect(source).toContain('@inventory="openInventoryDialog"')
})
