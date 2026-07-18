import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./MyPaymentsView.vue', import.meta.url), 'utf8')

describe('MyPaymentsView member selector', () => {
  it('delegates responsive member search to the dedicated payment selector', () => {
    expect(source).toContain("import PaymentMemberSelector from '@/components/payments/PaymentMemberSelector.vue'")
    expect(source).toContain('<PaymentMemberSelector')
    expect(source).toContain('v-model="selectedMemberId"')
    expect(source).toContain(':access-hint="createSubmissionAccessHint"')
    expect(source).toContain(':get-option-label="buildMemberOptionLabel"')
    expect(source).toContain(':get-billing-label="getPaymentMemberBillingLabel"')
  })
})

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
  it('uses fee permissions to expose a manager-only unopened group', () => {
    expect(source).toContain("import { usePermissionsStore } from '@/stores/permissions'")
    expect(source).toContain("permissionsStore.can('fees', 'VIEW') || permissionsStore.can('fees', 'EDIT')")
    expect(source).toContain('if (isUnopened && !canInspectUnopenedMatchFees.value)')
    expect(source).toContain("{ key: 'unopened', title: '尚未開放繳費'")
    expect(source.indexOf("key: 'pending'")).toBeLessThan(source.indexOf("key: 'unopened'"))
    expect(source.indexOf("key: 'unopened'")).toBeLessThan(source.indexOf("key: 'confirmed'"))
    expect(source).toContain('一般會員不會看到，也無法回報付款')
  })

  it('keeps unopened fees out of payment actions, totals and reminders', () => {
    const actionSummaryStart = source.indexOf('目前需要處理')
    const actionSummaryEnd = source.indexOf('</section>', actionSummaryStart)
    const actionSummarySource = source.slice(actionSummaryStart, actionSummaryEnd)

    expect(source).toContain('getPayableMatchFeeItems(matchFeeItems.value)')
    expect(source).toContain('selectable: isMatchFeeItemPayable(item)')
    expect(source).toContain("unpaid: unifiedPaymentRecords.value.filter((item) => item.groupKey === 'unpaid').length")
    expect(source).toContain("unopened: unifiedPaymentRecords.value.filter((item) => item.groupKey === 'unopened').length")
    expect(source).toContain(".filter((item) => item.groupKey === 'unpaid')")
    expect(source).toContain('const payableMatchFeeItems = getPayableMatchFeeItems(matchFeeItems.value)')
    expect(source).toContain('if (summary.unpaidCount <= 0)')
    expect(source).toContain('v-if="unifiedPaymentCounts.unopened > 0"')
    expect(source).toContain('class="flex flex-wrap items-center gap-2 text-xs font-black text-slate-500"')
    expect(actionSummarySource).toContain('unifiedPaymentCounts.unpaid')
    expect(actionSummarySource).toContain('unifiedPaymentCounts.pending')
    expect(actionSummarySource).not.toContain('unifiedPaymentCounts.unopened')
  })

  it('clears stale match-fee selections after refreshed items stop being payable', () => {
    expect(source).toContain('watch(matchFeeUnpaidItems, (items) => {')
    expect(source).toContain('const unpaidIds = new Set(items.map((item) => item.id))')
    expect(source).toContain('selectedMatchFeeItemIds.value = selectedMatchFeeItemIds.value.filter((id) => unpaidIds.has(id))')
  })

  it('renders retained payment history as a neutral closed state', () => {
    expect(source).toContain("isClosedHistory ? '已關閉'")
    expect(source).toContain('status: displayStatus')
    expect(source).toContain("if (status === 'cancelled')")
    expect(source).toContain('管理者重新開放前無法再次付款')
  })
})
