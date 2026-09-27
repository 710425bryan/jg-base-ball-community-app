<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { setMatchFeeItemExemption } from '@/services/matchFees'
import type { MatchFeeItem } from '@/types/matchFees'

const props = defineProps<{
  items: MatchFeeItem[]
  canEdit: boolean
  processingIds: Set<string>
}>()
const emit = defineEmits<{
  (event: 'exemption-updated'): void
  (event: 'rollback', item: MatchFeeItem): void
}>()
const savingId = ref<string | null>(null)
const formatCurrency = (amount: number) => `$${Number(amount || 0).toLocaleString('en-US')}`
const canChangeExemption = (item: MatchFeeItem) => Boolean(item.match_id)
  && ['unpaid', 'cancelled'].includes(item.payment_status)
  && !item.payment_submission_id
const statusLabel = (item: MatchFeeItem) => {
  if (item.is_exempt) return '單場免繳'
  return ({ paid: '已確認', pending_review: '待確認', cancelled: '已取消' } as Record<string, string>)[item.payment_status] || '未繳'
}
const statusClass = (item: MatchFeeItem) => {
  if (item.is_exempt) return 'border-primary/20 bg-primary/5 text-primary'
  if (item.payment_status === 'paid') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (item.payment_status === 'pending_review') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (item.payment_status === 'cancelled') return 'border-gray-200 bg-gray-100 text-gray-500'
  return 'border-red-100 bg-red-50 text-red-600'
}

// The switch follows the refreshed server value, including when a save fails.
const changeExemption = async (item: MatchFeeItem) => {
  if (!props.canEdit || savingId.value || !canChangeExemption(item)) return false
  savingId.value = item.id
  try {
    await setMatchFeeItemExemption(item.id, !item.is_exempt, item.updated_at)
    ElMessage.success(item.is_exempt ? '已關閉單場免繳，依參賽與請假狀態重新核對費用' : '已設定單場免繳，繳費紀錄不再列入此筆應繳金額')
    emit('exemption-updated')
  } catch (error: any) {
    ElMessage.error(error?.message || '更新單場免繳失敗')
    if (error?.code === 'P0002') emit('exemption-updated')
  } finally {
    savingId.value = null
  }
  return false
}
</script>

<template>
  <div>
    <p v-if="canEdit" class="mb-3 text-sm text-gray-500">
      單場免繳只影響這位球員本場費用。待確認或已確認的款項需先退回付款；應繳內容變更後，請確認是否需重新開放繳費。
    </p>
    <table class="block w-full md:table md:min-w-[900px]">
      <thead class="hidden md:table-header-group">
        <tr class="border-b border-gray-100 bg-gray-50/70">
          <th v-for="heading in ['球員', '金額', '狀態', '匯款資訊', '備註', '操作']" :key="heading" class="px-4 py-3 text-left text-sm font-bold text-gray-500">{{ heading }}</th>
        </tr>
      </thead>
      <tbody class="grid gap-3 md:table-row-group md:divide-y md:divide-gray-100">
        <tr v-for="item in items" :key="item.id" class="grid min-w-0 grid-cols-2 rounded-2xl border border-gray-100 p-3 md:table-row md:rounded-none md:border-0 md:p-0" :data-testid="`match-fee-member-${item.id}`">
          <td class="min-w-0 p-2 md:px-4 md:py-3">
            <div class="break-words font-black text-slate-800">{{ item.member_name }}</div>
            <div class="mt-1 text-xs text-gray-400">{{ item.member_role || '球員' }}</div>
          </td>
          <td class="p-2 text-right font-black text-primary md:px-4 md:py-3 md:text-left" data-testid="member-amount">{{ item.is_exempt ? '免繳' : formatCurrency(item.amount) }}</td>
          <td class="col-span-2 p-2 md:px-4 md:py-3">
            <span :class="statusClass(item)" class="inline-flex rounded-full border px-2.5 py-1 text-xs font-bold">{{ statusLabel(item) }}</span>
          </td>
          <td class="col-span-2 break-words p-2 text-sm text-gray-600 md:px-4 md:py-3">
            <span class="md:hidden">匯款資訊：</span>
            <span v-if="item.payment_method">{{ item.payment_method }}<span v-if="item.account_last_5"> / #{{ item.account_last_5 }}</span><span v-if="item.remittance_date"> / {{ item.remittance_date }}</span></span>
            <span v-else class="text-gray-400">尚未提供</span>
          </td>
          <td class="col-span-2 break-words p-2 text-sm text-gray-500 md:px-4 md:py-3">{{ item.is_exempt ? '本場費用不列入應繳金額' : item.cancelled_reason || ' ' }}</td>
          <td class="col-span-2 p-2 md:px-4 md:py-3">
            <div class="flex flex-wrap items-center gap-3">
              <el-switch
                v-if="canEdit && item.match_id"
                :model-value="item.is_exempt === true"
                :before-change="() => changeExemption(item)"
                :disabled="!canChangeExemption(item) || savingId !== null"
                :loading="savingId === item.id"
                :aria-label="`${item.member_name}單場免繳`"
                :title="canChangeExemption(item) ? '只調整此球員本場費用' : '請先退回付款再設定免繳'"
                active-text="單場免繳"
                class="!min-h-11"
              />
              <button
                v-if="canEdit && item.payment_status === 'paid' && item.payment_submission_id"
                type="button"
                class="min-h-11 rounded-xl border border-red-100 bg-red-50 px-3 text-sm font-bold text-red-600 disabled:opacity-70"
                :disabled="processingIds.has(item.payment_submission_id)"
                @click="emit('rollback', item)"
              >{{ processingIds.has(item.payment_submission_id) ? '退回中...' : '退回確認' }}</button>
              <span v-if="!canEdit || !item.match_id" class="text-sm text-gray-300">-</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
