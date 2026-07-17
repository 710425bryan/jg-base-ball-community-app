import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./EquipmentPurchasesView.vue', import.meta.url), 'utf8')

describe('EquipmentPurchasesView responsive workspace contract', () => {
  it('uses a desktop master-detail split and a full-screen mobile drawer', () => {
    expect(source).toContain('lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)]')
    expect(source).toContain('size="100%"')
    expect(source).toContain('equipment-admin-detail-drawer')
    expect(source).toContain('pt-[env(safe-area-inset-top)]')
  })

  it('keeps summary and advanced filters collapsed by default while leaving status controls visible', () => {
    expect(source).toContain('const isSummaryCollapsed = ref(true)')
    expect(source).toContain('const isAdvancedFiltersCollapsed = ref(true)')
    expect(source).toContain('controls="equipment-admin-summary"')
    expect(source).toContain('controls="equipment-admin-advanced-filters"')
    expect(source).toContain(':aria-pressed="activeStatus === option.value"')
  })

  it('shows request quantity statistics from all currently filtered records', () => {
    expect(source).toContain('summarizeEquipmentRequestQuantities(visibleRecords.value)')
    expect(source).toContain('<EquipmentRequestQuantitySummary')
    expect(source).toContain('v-if="activeArea === \'requests\'"')
    expect(source).toContain(':rows="requestQuantitySummaryRows"')
    expect(source.indexOf('<EquipmentRequestQuantitySummary')).toBeLessThan(source.indexOf('狀態金額摘要'))
  })

  it('keeps status color and wording visible beyond the filter label', () => {
    expect(source).toContain('getEquipmentAdminStatusPresentation')
    expect(source).toContain(':class="getStatusOptionClass(option.value)"')
    expect(source).toContain(':class="activeStatusPresentation.panelClass"')
    expect(source).toContain('{{ activeStatusPresentation.title }}')
    expect(source).toContain('{{ activeStatusPresentation.description }}')
    expect(source).toContain('aria-live="polite"')
    expect(source).toContain(':area="activeArea"')
    expect(source).toContain(':status="activeStatus"')
  })

  it('uses the legacy soft selected treatment for the management type switch', () => {
    expect(source).toContain("'border-orange-200 bg-orange-50/70 text-primary shadow-sm'")
    expect(source).not.toContain("activeArea === 'payments' ? 'bg-primary text-white'")
    expect(source).not.toContain("activeArea === 'requests' ? 'bg-primary text-white'")
  })

  it('uses consistent Element Plus controls for advanced filters', () => {
    expect(source.match(/<el-date-picker/g)).toHaveLength(2)
    expect(source).toContain('<el-select')
    expect(source).toContain('value-format="YYYY-MM-DD"')
    expect(source).toContain('class="equipment-admin-filter-control !w-full"')
    expect(source).not.toMatch(/<input[^>]+type="date"/)
    expect(source).not.toMatch(/<select(?:\s|>)/)
  })

  it('opens mobile details on selection and clears the URL selection when the drawer closes', () => {
    expect(source).toContain('if (!isDesktopViewport.value) detailDrawerOpen.value = true')
    expect(source).toContain('if (!isDesktopViewport.value && selectedKey.value) clearSelection(true)')
    expect(source).toContain('@closed="handleDrawerClosed"')
  })

  it('preserves pagination for selection-only route changes and clamps pages after refresh', () => {
    const applyRouteStateSource = source.slice(
      source.indexOf('const applyRouteState'),
      source.indexOf('const refresh')
    )

    expect(applyRouteStateSource).toContain('hasEquipmentAdminListContextChanged')
    expect(applyRouteStateSource).toContain('if (shouldResetPage) currentPage.value = 1')
    expect(applyRouteStateSource).not.toContain('\n  currentPage.value = 1')
    expect(source).toContain('clampEquipmentAdminPage(')
    expect(source).toContain(':page-size="EQUIPMENT_ADMIN_PAGE_SIZE"')
  })

  it('does not take over MainLayout route scrolling', () => {
    const templateSource = source.slice(source.indexOf('<template>'))
    const rootClass = templateSource.match(/<div class="([^"]+)"/)?.[1] || ''
    expect(rootClass.split(/\s+/)).not.toContain('h-full')
    expect(rootClass.split(/\s+/)).not.toContain('overflow-hidden')
  })
})
