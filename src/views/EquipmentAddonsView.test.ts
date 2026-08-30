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

  it('uses one shared cart panel for desktop and the mobile confirmation dialog', () => {
    expect(source).toContain("import EquipmentAddonCartPanel from '@/components/equipment/EquipmentAddonCartPanel.vue'")
    expect(source.match(/<EquipmentAddonCartPanel/g)).toHaveLength(2)
    expect(source).toContain('class="hidden w-full min-w-0 rounded-3xl')
    expect(source).toContain('title="確認裝備請購"')
    expect(source).toContain('加購成員')
    expect(source).toContain('confirm-label="送出請購"')
  })

  it('shows a safe-area mobile cart summary only for a non-empty shop draft', () => {
    expect(source).toContain('v-if="activeTab === \'shop\' && cart.length > 0"')
    expect(source).toContain("hasCartValidationIssues ? '檢視並修正' : '檢視並送出'")
    expect(source).toContain('bottom: calc(4.5rem + env(safe-area-inset-bottom) + 0.75rem)')
    expect(source).toContain("'equipment-addon-content--with-mobile-cart': activeTab === 'shop' && cart.length > 0")
  })

  it('clears note and closes the mobile cart when the last item is removed or submitted', () => {
    const removeHandler = source.slice(
      source.indexOf('const removeCartItem'),
      source.indexOf('const finishDiscardConfirmation')
    )
    expect(removeHandler).toContain('if (cart.value.length === 0)')
    expect(removeHandler).toContain("requestNote.value = ''")
    expect(removeHandler).toContain('isMobileCartDialogOpen.value = false')

    const submitHandler = source.slice(source.indexOf('const submitRequest'), source.indexOf('const cancelRequest'))
    expect(submitHandler).toContain('cart.value = []')
    expect(submitHandler).toContain('isMobileCartDialogOpen.value = false')
  })

  it('keeps one discard dialog flow with the required safe and danger actions', () => {
    expect(source).toContain("import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'")
    expect(source).toContain('isDirty: computed(() => cart.value.length > 0)')
    expect(source).toContain('if (pendingDiscardPromise)')
    expect(source).toContain('title="請購尚未送出"')
    expect(source).toContain(':close-on-click-modal="false"')
    expect(source).toContain('cancel-label="繼續填寫"')
    expect(source).toContain('confirm-label="放棄請購並離開"')
    expect(source).toContain('reopenCartAfterDiscardCancel = isMobileCartDialogOpen.value')
  })
})
