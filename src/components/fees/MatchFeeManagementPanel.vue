<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Lock, Unlock } from '@element-plus/icons-vue'
import AppCollapseButton from '@/components/common/AppCollapseButton.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import {
  deleteCancelledMatchFeeGroup,
  listMatchFeeItemsByMonth,
  rollbackMatchPaymentSubmission,
  setMatchFeePaymentOpenState
} from '@/services/matchFees'
import { usePermissionsStore } from '@/stores/permissions'
import type { MatchFeeItem, MatchPaymentSubmission } from '@/types/matchFees'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

type MatchFeeGroup = {
  key: string
  first: MatchFeeItem
  items: MatchFeeItem[]
  activeItems: MatchFeeItem[]
  total: number
  paid: number
  pending: number
  unpaid: number
  matchFeeAmount: number
  isPaymentOpen: boolean
  hasPaymentHistory: boolean
  allCancelled: boolean
}

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

const permissionsStore = usePermissionsStore()
const canEdit = computed(() => permissionsStore.can('fees', 'EDIT'))
const canDelete = computed(() => permissionsStore.can('fees', 'DELETE'))

const selectedMonth = ref(dayjs().format('YYYY-MM'))
const isLoading = ref(false)
const items = ref<MatchFeeItem[]>([])
const processingIds = ref(new Set<string>())
const expandedKeys = ref(new Set<string>())

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

const getGroupKey = (item: MatchFeeItem) => item.match_id || `detached:${JSON.stringify([
  item.match_name,
  item.tournament_name,
  item.match_date,
  item.match_time,
  item.category_group
])}`

const getStartMinutes = (value?: string | null) => {
  const match = String(value || '').match(/(?:^|\D)(\d{1,2}):(\d{2})/)
  if (!match) return Number.POSITIVE_INFINITY

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return Number.POSITIVE_INFINITY
  return hours * 60 + minutes
}

const groupedMatches = computed<MatchFeeGroup[]>(() => {
  const groups = new Map<string, MatchFeeItem[]>()
  items.value.forEach((item) => {
    const key = getGroupKey(item)
    groups.set(key, [...(groups.get(key) || []), item])
  })

  return [...groups.entries()]
    .map(([key, rawGroupItems]) => {
      const groupItems = [...rawGroupItems].sort((left, right) =>
        left.member_name.localeCompare(right.member_name, 'zh-Hant')
      )
      const first = groupItems[0]
      const activeItems = groupItems.filter((item) => item.payment_status !== 'cancelled')
      const matchFeeAmount = Number(
        groupItems.find((item) => item.match_fee_amount != null)?.match_fee_amount || 0
      )

      return {
        key,
        first,
        items: groupItems,
        activeItems,
        total: activeItems.reduce((total, item) => total + Number(item.amount || 0), 0),
        paid: groupItems
          .filter((item) => item.payment_status === 'paid')
          .reduce((total, item) => total + Number(item.amount || 0), 0),
        pending: groupItems
          .filter((item) => item.payment_status === 'pending_review')
          .reduce((total, item) => total + Number(item.amount || 0), 0),
        unpaid: groupItems
          .filter((item) => item.payment_status === 'unpaid')
          .reduce((total, item) => total + Number(item.amount || 0), 0),
        matchFeeAmount,
        isPaymentOpen: groupItems.some((item) => Boolean(item.payment_opened_at)),
        hasPaymentHistory: groupItems.some((item) => item.has_payment_history === true),
        allCancelled: groupItems.every((item) => item.payment_status === 'cancelled')
      }
    })
    .sort((left, right) => {
      const dateOrder = String(left.first.match_date || '9999-12-31')
        .localeCompare(String(right.first.match_date || '9999-12-31'))
      if (dateOrder !== 0) return dateOrder

      const timeOrder = getStartMinutes(left.first.match_time) - getStartMinutes(right.first.match_time)
      if (Number.isFinite(timeOrder) && timeOrder !== 0) return timeOrder
      if (getStartMinutes(left.first.match_time) !== getStartMinutes(right.first.match_time)) {
        return getStartMinutes(left.first.match_time) === Number.POSITIVE_INFINITY ? 1 : -1
      }

      return left.key.localeCompare(right.key)
    })
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

const getGroupContentId = (group: MatchFeeGroup) => `match-fee-group-${group.first.id}`

const isExpanded = (key: string) => expandedKeys.value.has(key)

const toggleGroup = (key: string) => {
  const next = new Set(expandedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedKeys.value = next
}

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
    const currentKeys = new Set(groupedMatches.value.map((group) => group.key))
    expandedKeys.value = new Set([...expandedKeys.value].filter((key) => currentKeys.has(key)))
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取比賽費用失敗')
  } finally {
    isLoading.value = false
  }
}

const isDialogCancelled = (error: unknown) => error === 'cancel' || error === 'close'

const changePaymentOpenState = async (group: MatchFeeGroup, isOpen: boolean) => {
  const matchId = group.first.match_id
  if (!matchId) return

  try {
    if (isOpen) {
      await ElMessageBox.confirm(
        `每位球員 ${formatCurrency(group.matchFeeAmount)}，應繳 ${group.activeItems.length} 人，總計 ${formatCurrency(group.total)}。開放後家長即可看見並回報付款。`,
        '確認開放比賽費用繳費',
        {
          confirmButtonText: '確認開放',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
    } else {
      await ElMessageBox.confirm(
        '關閉後，尚未付款的家長將看不到這場費用，也無法送出付款回報；費用資料仍會保留。',
        '確認關閉比賽費用繳費',
        {
          confirmButtonText: '確認關閉',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
    }
  } catch (error) {
    if (!isDialogCancelled(error)) console.warn('Match fee open state confirmation interrupted', error)
    return
  }

  const processingKey = `open-state:${group.key}`
  setProcessing(processingKey, true)
  try {
    await setMatchFeePaymentOpenState(matchId, isOpen)
    ElMessage.success(isOpen ? '已開放比賽費用繳費' : '已關閉比賽費用繳費')
    await refresh()
  } catch (error: any) {
    ElMessage.error(error?.message || (isOpen ? '開放比賽費用失敗' : '關閉比賽費用失敗'))
  } finally {
    setProcessing(processingKey, false)
  }
}

const deleteCancelledGroup = async (group: MatchFeeGroup) => {
  try {
    await ElMessageBox.confirm(
      `將永久刪除「${group.first.match_name}」整場 ${group.items.length} 筆已取消費用。此動作無法復原。`,
      '刪除此比賽費用',
      {
        confirmButtonText: '確認刪除',
        cancelButtonText: '取消',
        type: 'error'
      }
    )
  } catch (error) {
    if (!isDialogCancelled(error)) console.warn('Match fee group deletion confirmation interrupted', error)
    return
  }

  const processingKey = `delete:${group.key}`
  setProcessing(processingKey, true)
  try {
    const deletedCount = await deleteCancelledMatchFeeGroup(group.first.id)
    ElMessage.success(`已刪除 ${deletedCount} 筆已取消比賽費用`)
    await refresh()
  } catch (error: any) {
    ElMessage.error(error?.message || '刪除此比賽費用失敗')
  } finally {
    setProcessing(processingKey, false)
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
    if (!isDialogCancelled(error)) console.warn('Match fee rollback confirm interrupted', error)
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
  expandedKeys.value = new Set()
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
    <div class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 class="text-xl font-black text-slate-800">比賽費用月份檢視</h3>
          <p class="mt-1 text-sm text-gray-500">先核對費用與球員名單，再逐場開放家長繳費。</p>
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
            class="min-h-11 rounded-2xl border border-gray-200 px-4 font-bold text-gray-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-70"
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

    <div v-else class="space-y-4" data-testid="match-fee-groups">
      <article
        v-for="group in groupedMatches"
        :key="group.key"
        class="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm md:p-5"
        :data-testid="`match-fee-group-${group.first.match_name}`"
      >
        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="text-lg font-black text-slate-800">{{ group.first.match_name }}</h4>
              <span
                class="inline-flex rounded-full border px-2.5 py-1 text-xs font-bold"
                :class="group.isPaymentOpen
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 bg-gray-100 text-gray-500'"
                data-testid="payment-open-state"
              >
                {{ group.isPaymentOpen ? '已開放' : '未開放' }}
              </span>
            </div>
            <p class="mt-1 text-xs font-bold text-gray-400">{{ getMatchSubtitle(group.first) }}</p>
            <p v-if="group.isPaymentOpen && group.first.payment_opened_by_name" class="mt-1 text-xs text-gray-400">
              由 {{ group.first.payment_opened_by_name }} 開放
            </p>
          </div>

          <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
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

            <div
              class="grid w-full grid-cols-2 items-stretch gap-2 md:flex md:w-auto md:flex-wrap md:items-center md:justify-end"
              data-testid="match-fee-group-actions"
            >
              <div class="flex min-w-0 flex-col gap-2 md:contents">
                <button
                  v-if="canEdit && !group.isPaymentOpen && group.first.match_id && group.matchFeeAmount > 0 && group.activeItems.length > 0"
                  type="button"
                  class="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-70 md:w-auto"
                  :disabled="processingIds.has(`open-state:${group.key}`)"
                  data-testid="open-payment-button"
                  @click="changePaymentOpenState(group, true)"
                >
                  <el-icon><Unlock /></el-icon>
                  {{ processingIds.has(`open-state:${group.key}`) ? '開放中...' : '開放繳費' }}
                </button>

                <button
                  v-if="canEdit && group.isPaymentOpen"
                  type="button"
                  class="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
                  :disabled="group.hasPaymentHistory || processingIds.has(`open-state:${group.key}`)"
                  :title="group.hasPaymentHistory ? '已有付款回報歷程，不能關閉繳費' : '關閉後將隱藏家長端未付款項目'"
                  data-testid="close-payment-button"
                  @click="changePaymentOpenState(group, false)"
                >
                  <el-icon><Lock /></el-icon>
                  {{ group.hasPaymentHistory ? '已有付款歷程' : '關閉繳費' }}
                </button>

                <button
                  v-if="canDelete && group.allCancelled"
                  type="button"
                  class="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
                  :disabled="group.hasPaymentHistory || processingIds.has(`delete:${group.key}`)"
                  :title="group.hasPaymentHistory ? '已有付款歷程，必須保留稽核紀錄' : '永久刪除此比賽的取消費用'"
                  data-testid="delete-cancelled-group-button"
                  @click="deleteCancelledGroup(group)"
                >
                  <el-icon><Delete /></el-icon>
                  {{ group.hasPaymentHistory ? '保留付款紀錄' : '刪除此比賽費用' }}
                </button>
              </div>

              <AppCollapseButton
                class="col-start-2 w-full rounded-xl border border-gray-200 px-3 text-xs font-bold text-gray-600 hover:border-primary hover:text-primary md:col-auto md:w-auto"
                :expanded="isExpanded(group.key)"
                :controls="getGroupContentId(group)"
                :label="`${group.first.match_name}費用明細`"
                data-testid="match-fee-collapse-toggle"
                @toggle="toggleGroup(group.key)"
              />
            </div>
          </div>
        </div>

        <el-collapse-transition>
          <div
            v-show="isExpanded(group.key)"
            :id="getGroupContentId(group)"
            class="mt-4 overflow-x-auto"
            data-testid="match-fee-group-details"
          >
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
                <tr v-for="item in group.items" :key="item.id" class="transition-colors hover:bg-gray-50/60">
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
                      class="min-h-11 rounded-xl border border-red-100 bg-red-50 px-3 text-xs font-bold text-red-600 transition-colors hover:border-red-200 hover:bg-red-100 disabled:opacity-70"
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
        </el-collapse-transition>
      </article>
    </div>
  </section>
</template>
