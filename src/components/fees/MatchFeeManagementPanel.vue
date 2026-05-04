<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { listMatchFeeItemsByMonth, rollbackMatchPaymentSubmission } from '@/services/matchFees'
import type { MatchFeeItem, MatchPaymentSubmission } from '@/types/matchFees'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

const emit = defineEmits<{
  (event: 'summary-change', summary: {
    periodLabel: string
    total: number
    paid: number
    unpaid: number
    isReady: boolean
  }): void
  (event: 'payment-updated', submission: MatchPaymentSubmission): void
}>()

const selectedMonth = ref(dayjs().format('YYYY-MM'))
const isLoading = ref(false)
const items = ref<MatchFeeItem[]>([])
const processingIds = ref(new Set<string>())

const totalAmount = computed(() =>
  items.value
    .filter((item) => item.payment_status !== 'cancelled')
    .reduce((total, item) => total + Number(item.amount || 0), 0)
)

const paidAmount = computed(() =>
  items.value
    .filter((item) => item.payment_status === 'paid')
    .reduce((total, item) => total + Number(item.amount || 0), 0)
)

const pendingAmount = computed(() =>
  items.value
    .filter((item) => item.payment_status === 'pending_review')
    .reduce((total, item) => total + Number(item.amount || 0), 0)
)

const unpaidAmount = computed(() =>
  items.value
    .filter((item) => item.payment_status === 'unpaid')
    .reduce((total, item) => total + Number(item.amount || 0), 0)
)

const cancelledAmount = computed(() =>
  items.value
    .filter((item) => item.payment_status === 'cancelled')
    .reduce((total, item) => total + Number(item.amount || 0), 0)
)

const groupedMatches = computed(() => {
  const groups = new Map<string, MatchFeeItem[]>()
  items.value.forEach((item) => {
    const key = item.match_id || `${item.match_name}-${item.match_date}-${item.match_time || ''}`
    groups.set(key, [...(groups.get(key) || []), item])
  })

  return [...groups.entries()].map(([key, groupItems]) => ({
    key,
    first: groupItems[0],
    items: groupItems,
    total: groupItems
      .filter((item) => item.payment_status !== 'cancelled')
      .reduce((total, item) => total + Number(item.amount || 0), 0),
    paid: groupItems
      .filter((item) => item.payment_status === 'paid')
      .reduce((total, item) => total + Number(item.amount || 0), 0),
    pending: groupItems
      .filter((item) => item.payment_status === 'pending_review')
      .reduce((total, item) => total + Number(item.amount || 0), 0),
    unpaid: groupItems
      .filter((item) => item.payment_status === 'unpaid')
      .reduce((total, item) => total + Number(item.amount || 0), 0)
  }))
})

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const formatDate = (value?: string | null) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '尚無資料'
}

const getPaymentStatusLabel = (status?: string | null) => {
  if (status === 'paid') return '已確認'
  if (status === 'pending_review') return '待確認'
  if (status === 'cancelled') return '已取消'
  return '未繳'
}

const getPaymentStatusClass = (status?: string | null) => {
  if (status === 'paid') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  if (status === 'pending_review') return 'bg-amber-50 border-amber-200 text-amber-700'
  if (status === 'cancelled') return 'bg-gray-100 border-gray-200 text-gray-500'
  return 'bg-red-50 border-red-100 text-red-600'
}

const getMatchSubtitle = (item: MatchFeeItem) => [
  item.tournament_name || null,
  item.category_group || null,
  formatDate(item.match_date),
  item.match_time || null
].filter(Boolean).join('｜')

const setProcessing = (id: string, value: boolean) => {
  const next = new Set(processingIds.value)
  if (value) next.add(id)
  else next.delete(id)
  processingIds.value = next
}

const refresh = async () => {
  isLoading.value = true
  try {
    items.value = await listMatchFeeItemsByMonth(selectedMonth.value)
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取比賽費用失敗')
  } finally {
    isLoading.value = false
  }
}

const notifySubmitter = async (submission: MatchPaymentSubmission) => {
  try {
    await dispatchPushNotification({
      title: '比賽費用付款已退回',
      body: `${submission.member_name} 的比賽費用付款確認已退回，請至繳費資訊查看。`,
      url: `/my-payments?highlight_match_submission_id=${submission.id}`,
      feature: 'fees',
      action: 'VIEW',
      targetUserIds: [submission.profile_id],
      eventKey: buildPushEventKey('match-fee-payment-rollback', submission.id)
    })
  } catch (error) {
    console.warn('Match fee payment rollback push failed', error)
  }
}

const rollbackPaidSubmission = async (item: MatchFeeItem) => {
  const submissionId = item.payment_submission_id
  if (!submissionId) {
    ElMessage.warning('這筆已確認項目沒有付款回報連結，無法退回。')
    return
  }

  try {
    await ElMessageBox.confirm(
      '退回後，同一筆付款回報包含的比賽費用都會改回未繳；若審核時有扣抵或溢繳轉入球員餘額，也會建立反向餘額紀錄沖回。',
      '退回已確認比賽費用付款',
      {
        confirmButtonText: '退回確認',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch (error) {
    if (error !== 'cancel') {
      console.warn('Match fee rollback confirm interrupted', error)
    }
    return
  }

  setProcessing(submissionId, true)
  try {
    const updated = await rollbackMatchPaymentSubmission(submissionId)
    ElMessage.success('已退回比賽費用付款確認')
    emit('payment-updated', updated)
    await Promise.all([
      refresh(),
      notifySubmitter(updated)
    ])
  } catch (error: any) {
    ElMessage.error(error?.message || '退回比賽費用付款確認失敗')
  } finally {
    setProcessing(submissionId, false)
  }
}

watch(
  [selectedMonth, totalAmount, paidAmount, unpaidAmount],
  () => {
    emit('summary-change', {
      periodLabel: selectedMonth.value,
      total: totalAmount.value,
      paid: paidAmount.value,
      unpaid: unpaidAmount.value,
      isReady: true
    })
  },
  { immediate: true }
)

watch(selectedMonth, () => {
  void refresh()
})

onMounted(() => {
  void refresh()
})

defineExpose({
  refresh
})
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-3xl border border-gray-100 bg-white p-5 md:p-6 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 class="text-xl font-black text-slate-800">比賽費用月份檢視</h3>
          <p class="mt-1 text-sm text-gray-500">依比賽日期月份彙整每場比賽產生的球員費用。</p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <el-date-picker
            v-model="selectedMonth"
            type="month"
            value-format="YYYY-MM"
            class="!w-full sm:!w-48"
            size="large"
            placeholder="選擇月份"
          />
          <button
            type="button"
            class="rounded-2xl border border-gray-200 px-4 py-3 font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors disabled:opacity-70"
            :disabled="isLoading"
            @click="refresh"
          >
            {{ isLoading ? '更新中...' : '重新整理' }}
          </button>
        </div>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div class="rounded-2xl border border-primary/10 bg-primary/5 p-4">
          <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/70">應收</div>
          <div class="mt-2 text-2xl font-black text-primary">{{ formatCurrency(totalAmount) }}</div>
        </div>
        <div class="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">已收</div>
          <div class="mt-2 text-2xl font-black text-emerald-700">{{ formatCurrency(paidAmount) }}</div>
        </div>
        <div class="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">待確認</div>
          <div class="mt-2 text-2xl font-black text-amber-700">{{ formatCurrency(pendingAmount) }}</div>
        </div>
        <div class="rounded-2xl border border-red-100 bg-red-50 p-4">
          <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-red-700">未繳</div>
          <div class="mt-2 text-2xl font-black text-red-700">{{ formatCurrency(unpaidAmount) }}</div>
        </div>
        <div class="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">取消</div>
          <div class="mt-2 text-2xl font-black text-gray-600">{{ formatCurrency(cancelledAmount) }}</div>
        </div>
      </div>
    </div>

    <AppLoadingState v-if="isLoading" text="讀取比賽費用中..." min-height="10rem" />

    <div v-else-if="items.length === 0" class="rounded-3xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm font-bold text-gray-400">
      這個月份目前沒有比賽費用。
    </div>

    <div v-else class="space-y-4">
      <article
        v-for="group in groupedMatches"
        :key="group.key"
        class="rounded-3xl border border-gray-100 bg-white p-4 md:p-5 shadow-sm"
      >
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h4 class="text-lg font-black text-slate-800">{{ group.first.match_name }}</h4>
            <p class="mt-1 text-xs font-bold text-gray-400">{{ getMatchSubtitle(group.first) }}</p>
          </div>
          <div class="grid grid-cols-3 gap-2 text-right text-xs font-bold text-gray-500 sm:min-w-[260px]">
            <div>
              <div>應收</div>
              <div class="mt-1 text-sm font-black text-primary">{{ formatCurrency(group.total) }}</div>
            </div>
            <div>
              <div>已收</div>
              <div class="mt-1 text-sm font-black text-emerald-700">{{ formatCurrency(group.paid) }}</div>
            </div>
            <div>
              <div>未處理</div>
              <div class="mt-1 text-sm font-black text-amber-700">{{ formatCurrency(group.pending + group.unpaid) }}</div>
            </div>
          </div>
        </div>

        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[900px]">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50/70">
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">球員</th>
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">金額</th>
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">狀態</th>
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">匯款資訊</th>
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">備註</th>
                <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr v-for="item in group.items" :key="item.id" class="hover:bg-gray-50/60 transition-colors">
                <td class="px-4 py-3">
                  <div class="font-black text-slate-800">{{ item.member_name }}</div>
                  <div class="mt-1 text-xs text-gray-400">{{ item.member_role || '球員' }}</div>
                </td>
                <td class="px-4 py-3 font-black text-primary">{{ formatCurrency(item.amount) }}</td>
                <td class="px-4 py-3">
                  <span :class="getPaymentStatusClass(item.payment_status)" class="inline-flex rounded-full border px-2.5 py-1 text-xs font-bold">
                    {{ getPaymentStatusLabel(item.payment_status) }}
                  </span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600">
                  <span v-if="item.payment_method">
                    {{ item.payment_method }}<span v-if="item.account_last_5"> / #{{ item.account_last_5 }}</span><span v-if="item.remittance_date"> / {{ item.remittance_date }}</span>
                  </span>
                  <span v-else class="text-gray-400">尚未提供</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">
                  {{ item.cancelled_reason || ' ' }}
                </td>
                <td class="px-4 py-3">
                  <button
                    v-if="item.payment_status === 'paid' && item.payment_submission_id"
                    type="button"
                    class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:border-red-200 hover:bg-red-100 disabled:opacity-70"
                    :disabled="processingIds.has(item.payment_submission_id)"
                    @click="rollbackPaidSubmission(item)"
                  >
                    {{ processingIds.has(item.payment_submission_id) ? '退回中...' : '退回確認' }}
                  </button>
                  <span v-else class="text-sm text-gray-300">-</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>
  </section>
</template>
