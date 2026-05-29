<template>
  <section class="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm" v-loading="isLoading">
    <div class="border-b border-emerald-100 bg-emerald-50/80 px-4 py-4 md:px-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="flex items-start gap-3">
          <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <el-icon><Wallet /></el-icon>
          </span>
          <div>
            <h3 class="text-base font-black text-emerald-900">季費堂數不足補償</h3>
            <p class="mt-1 text-xs leading-relaxed text-emerald-700/80">
              依當月週六數與訓練日期設定總天數試算，核准後轉入球員餘額。
            </p>
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-[minmax(0,12rem)_auto_auto]">
          <el-select
            v-model="selectedMonth"
            size="large"
            class="w-full"
            placeholder="選擇月份"
          >
            <el-option
              v-for="option in monthOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
            :disabled="isLoading"
            @click="loadData"
          >
            <el-icon :class="{ 'is-loading': isLoading }"><Refresh /></el-icon>
            重新整理
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            :disabled="!canEdit || isGenerating || !monthSummary || monthSummary.compensationDays <= 0"
            @click="generateDrafts"
          >
            <el-icon><Calendar /></el-icon>
            {{ isGenerating ? '產生中...' : '產生待審核' }}
          </button>
        </div>
      </div>
    </div>

    <div class="space-y-4 p-4 md:p-5">
      <div class="grid gap-3 md:grid-cols-4">
        <div class="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p class="text-xs font-bold text-slate-500">當月基準堂數</p>
          <p class="mt-2 text-2xl font-black text-slate-800">{{ monthSummary?.baselineSessionCount ?? 0 }}</p>
          <p class="mt-1 text-xs text-slate-400">該月週六數</p>
        </div>
        <div class="rounded-2xl border border-sky-100 bg-sky-50 p-4">
          <p class="text-xs font-bold text-sky-700">訓練日期設定</p>
          <p class="mt-2 text-2xl font-black text-sky-800">{{ monthSummary?.configuredSessionCount ?? 0 }}</p>
          <p class="mt-1 text-xs text-sky-600/80">不限定星期幾</p>
        </div>
        <div class="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <p class="text-xs font-bold text-amber-700">待補償天數</p>
          <p class="mt-2 text-2xl font-black text-amber-800">{{ monthSummary?.compensationDays ?? 0 }}</p>
          <p class="mt-1 text-xs text-amber-600/80">不足堂數</p>
        </div>
        <div class="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <p class="text-xs font-bold text-emerald-700">每日折抵預設</p>
          <p class="mt-2 text-xl font-black text-emerald-800">
            {{ formatCurrency(defaults.regularDailyCredit) }} / {{ formatCurrency(defaults.discountDailyCredit) }}
          </p>
          <p class="mt-1 text-xs text-emerald-600/80">一般 / 半價</p>
        </div>
      </div>

      <div
        v-if="monthSummary && monthSummary.compensationDays <= 0"
        class="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm font-bold text-emerald-800"
      >
        {{ selectedMonth }} 的訓練日期設定天數已達當月週六數，不需要產生季費補償。
      </div>

      <div
        v-else-if="monthSummary"
        class="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm font-bold text-amber-800"
      >
        {{ selectedMonth }} 尚有 {{ monthSummary.compensationDays }} 天不足，請產生待審核資料後逐筆確認。
      </div>

      <div v-if="items.length === 0" class="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm font-bold text-gray-400">
        目前沒有待審核或已審核的季費補償紀錄。
      </div>

      <div v-else class="overflow-x-auto rounded-2xl border border-gray-100">
        <table class="w-full min-w-[1120px] table-fixed">
          <thead>
            <tr class="border-b border-gray-100 bg-gray-50/80">
              <th class="w-28 px-4 py-3 text-left text-sm font-bold whitespace-nowrap text-gray-500">球員</th>
              <th class="w-24 px-4 py-3 text-center text-sm font-bold whitespace-nowrap text-gray-500">狀態</th>
              <th class="w-24 px-3 py-3 text-center text-sm font-bold whitespace-nowrap text-gray-500">基準 / 設定</th>
              <th class="w-20 px-3 py-3 text-center text-sm font-bold whitespace-nowrap text-gray-500">補償天數</th>
              <th class="w-24 px-3 py-3 text-center text-sm font-bold whitespace-nowrap text-gray-500">每日折抵</th>
              <th class="w-24 px-3 py-3 text-center text-sm font-bold whitespace-nowrap text-gray-500">建議補償</th>
              <th class="w-44 px-3 py-3 text-center text-sm font-bold whitespace-nowrap text-gray-500">核准金額</th>
              <th class="w-48 px-4 py-3 text-left text-sm font-bold whitespace-nowrap text-gray-500">備註</th>
              <th class="w-40 px-4 py-3 text-center text-sm font-bold whitespace-nowrap text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="item in items" :key="item.id" class="hover:bg-gray-50/60">
              <td class="px-4 py-3">
                <div class="truncate font-black text-slate-800">{{ item.member_name }}</div>
                <div class="text-xs font-bold text-slate-400">{{ item.month }}</div>
              </td>
              <td class="px-4 py-3 text-center">
                <span class="inline-flex min-w-16 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black" :class="getStatusClass(item.status)">
                  {{ getStatusLabel(item.status) }}
                </span>
              </td>
              <td class="px-3 py-3 text-center font-mono text-sm font-black whitespace-nowrap text-slate-600">
                {{ item.baseline_session_count }} / {{ item.configured_session_count }}
              </td>
              <td class="px-3 py-3 text-center font-mono font-black whitespace-nowrap text-slate-700">
                {{ item.compensation_days }}
              </td>
              <td class="px-3 py-3 text-center font-mono font-bold whitespace-nowrap text-slate-600">
                <div>{{ formatCurrency(item.daily_credit_amount) }}</div>
                <div
                  v-if="isDiscountDailyCredit(item)"
                  class="mt-1 inline-flex items-center justify-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700"
                >
                  手足半價
                </div>
              </td>
              <td class="px-3 py-3 text-center font-mono font-black whitespace-nowrap text-primary">
                {{ formatCurrency(item.suggested_amount) }}
              </td>
              <td class="px-3 py-3 text-center">
                <el-input-number
                  v-if="item.status === 'pending'"
                  v-model="approvalAmountMap[item.id]"
                  :min="0"
                  :step="50"
                  size="large"
                  class="!w-36"
                />
                <span v-else class="font-mono font-black text-slate-700">
                  {{ formatCurrency(item.approved_amount) }}
                </span>
              </td>
              <td class="px-4 py-3">
                <el-input
                  v-if="item.status === 'pending'"
                  v-model="noteMap[item.id]"
                  size="large"
                  maxlength="120"
                  placeholder="選填"
                />
                <span v-else class="text-sm text-slate-500">{{ item.note || '-' }}</span>
              </td>
              <td class="px-4 py-3">
                <div v-if="item.status === 'pending'" class="flex flex-nowrap justify-center gap-2">
                  <button
                    type="button"
                    class="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
                    :disabled="!canEdit || processingIds.has(item.id)"
                    @click="approveItem(item)"
                  >
                    <el-icon><Check /></el-icon>
                    核准
                  </button>
                  <button
                    type="button"
                    class="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-60"
                    :disabled="!canEdit || processingIds.has(item.id)"
                    @click="skipItem(item)"
                  >
                    <el-icon><CloseBold /></el-icon>
                    略過
                  </button>
                </div>
                <div v-else class="text-center text-xs font-bold text-slate-400">
                  {{ formatDateTime(item.reviewed_at) }}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Check, CloseBold, Refresh, Wallet } from '@element-plus/icons-vue'
import { usePermissionsStore } from '@/stores/permissions'
import {
  approveQuarterlyFeeCompensationItem,
  generateQuarterlyFeeCompensationDrafts,
  getQuarterlyFeeCompensationDefaults,
  listQuarterlyFeeCompensationItems,
  skipQuarterlyFeeCompensationItem
} from '@/services/quarterlyFeeCompensations'
import { trainingDatesApi } from '@/services/trainingDatesApi'
import type {
  QuarterlyFeeCompensationDefaults,
  QuarterlyFeeCompensationItem
} from '@/types/quarterlyFeeCompensation'
import {
  DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT,
  DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT,
  buildQuarterlyFeeCompensationMonthSummary
} from '@/utils/quarterlyFeeCompensation'

const props = defineProps<{
  periodKey: string
  startMonth: string
  endMonth: string
}>()

const permissionsStore = usePermissionsStore()
const canEdit = computed(() => permissionsStore.can('fees', 'EDIT'))

const selectedMonth = ref(props.startMonth)
const isLoading = ref(false)
const isGenerating = ref(false)
const loadToken = ref(0)
const items = ref<QuarterlyFeeCompensationItem[]>([])
const defaults = ref<QuarterlyFeeCompensationDefaults>({
  regularDailyCredit: DEFAULT_QUARTERLY_COMPENSATION_REGULAR_DAILY_CREDIT,
  discountDailyCredit: DEFAULT_QUARTERLY_COMPENSATION_DISCOUNT_DAILY_CREDIT
})
const monthSummary = ref<ReturnType<typeof buildQuarterlyFeeCompensationMonthSummary> | null>(null)
const approvalAmountMap = ref<Record<string, number>>({})
const noteMap = ref<Record<string, string>>({})
const processingIds = ref(new Set<string>())

const monthOptions = computed(() => {
  const start = dayjs(`${props.startMonth}-01`)
  const end = dayjs(`${props.endMonth}-01`)
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return []

  const options: Array<{ value: string; label: string }> = []
  let cursor = start.startOf('month')
  const endTime = end.startOf('month').valueOf()

  while (cursor.valueOf() <= endTime) {
    options.push({
      value: cursor.format('YYYY-MM'),
      label: cursor.format('YYYY 年 M 月')
    })
    cursor = cursor.add(1, 'month')
  }

  return options
})

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '-'
}

const syncEditableFields = () => {
  const nextAmounts: Record<string, number> = {}
  const nextNotes: Record<string, string> = {}

  items.value.forEach((item) => {
    nextAmounts[item.id] = Number(item.approved_amount || item.suggested_amount || 0)
    nextNotes[item.id] = item.note || ''
  })

  approvalAmountMap.value = nextAmounts
  noteMap.value = nextNotes
}

const replaceItem = (updatedItem: QuarterlyFeeCompensationItem | null) => {
  if (!updatedItem?.id) return
  items.value = items.value.map((item) => item.id === updatedItem.id ? updatedItem : item)
  syncEditableFields()
}

const loadData = async () => {
  if (!props.periodKey || !selectedMonth.value) return
  const currentToken = loadToken.value + 1
  loadToken.value = currentToken
  isLoading.value = true

  try {
    const [nextDefaults, monthDates, nextItems] = await Promise.all([
      getQuarterlyFeeCompensationDefaults(),
      trainingDatesApi.getMonthDates(selectedMonth.value),
      listQuarterlyFeeCompensationItems({
        periodKey: props.periodKey,
        month: selectedMonth.value
      })
    ])

    if (loadToken.value !== currentToken) return

    defaults.value = nextDefaults
    monthSummary.value = buildQuarterlyFeeCompensationMonthSummary({
      month: selectedMonth.value,
      trainingDates: monthDates.training_dates
    })
    items.value = nextItems
    syncEditableFields()
  } catch (error: any) {
    ElMessage.error(error?.message || '載入季費補償資料失敗')
  } finally {
    if (loadToken.value === currentToken) {
      isLoading.value = false
    }
  }
}

const generateDrafts = async () => {
  if (!canEdit.value || !selectedMonth.value || !monthSummary.value) return
  if (monthSummary.value.compensationDays <= 0) {
    ElMessage.info('本月設定堂數已達基準堂數，不需要補償。')
    return
  }

  isGenerating.value = true
  try {
    items.value = await generateQuarterlyFeeCompensationDrafts({
      periodKey: props.periodKey,
      month: selectedMonth.value
    })
    syncEditableFields()
    ElMessage.success('已產生待審核補償資料')
  } catch (error: any) {
    ElMessage.error(error?.message || '產生補償資料失敗')
  } finally {
    isGenerating.value = false
  }
}

const approveItem = async (item: QuarterlyFeeCompensationItem) => {
  if (!canEdit.value) return
  processingIds.value.add(item.id)
  processingIds.value = new Set(processingIds.value)

  try {
    const updatedItem = await approveQuarterlyFeeCompensationItem({
      itemId: item.id,
      approvedAmount: approvalAmountMap.value[item.id],
      note: noteMap.value[item.id] || null
    })
    replaceItem(updatedItem)
    ElMessage.success('已核准並轉入球員餘額')
  } catch (error: any) {
    ElMessage.error(error?.message || '核准補償失敗')
  } finally {
    processingIds.value.delete(item.id)
    processingIds.value = new Set(processingIds.value)
  }
}

const skipItem = async (item: QuarterlyFeeCompensationItem) => {
  if (!canEdit.value) return

  try {
    await ElMessageBox.confirm(`確定要略過 ${item.member_name} 的補償嗎？`, '略過補償', {
      type: 'warning',
      confirmButtonText: '略過',
      cancelButtonText: '取消'
    })
  } catch (error) {
    return
  }

  processingIds.value.add(item.id)
  processingIds.value = new Set(processingIds.value)

  try {
    const updatedItem = await skipQuarterlyFeeCompensationItem({
      itemId: item.id,
      note: noteMap.value[item.id] || null
    })
    replaceItem(updatedItem)
    ElMessage.success('已略過補償')
  } catch (error: any) {
    ElMessage.error(error?.message || '略過補償失敗')
  } finally {
    processingIds.value.delete(item.id)
    processingIds.value = new Set(processingIds.value)
  }
}

const getStatusLabel = (status: string) => {
  if (status === 'approved') return '已核准'
  if (status === 'skipped') return '已略過'
  return '待審核'
}

const getStatusClass = (status: string) => {
  if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border border-emerald-100'
  if (status === 'skipped') return 'bg-slate-100 text-slate-600 border border-slate-200'
  return 'bg-amber-50 text-amber-700 border border-amber-100'
}

const isDiscountDailyCredit = (item: QuarterlyFeeCompensationItem) => {
  const regularDailyCredit = Number(defaults.value.regularDailyCredit) || 0
  const discountDailyCredit = Number(defaults.value.discountDailyCredit) || 0
  const itemDailyCredit = Number(item.daily_credit_amount) || 0

  if (regularDailyCredit <= 0 || itemDailyCredit <= 0) return false
  return itemDailyCredit === discountDailyCredit || itemDailyCredit < regularDailyCredit
}

watch(monthOptions, (options) => {
  if (options.length === 0) return
  if (!options.some((option) => option.value === selectedMonth.value)) {
    selectedMonth.value = options[0].value
  }
}, { immediate: true })

watch([
  () => props.periodKey,
  selectedMonth
], () => {
  void loadData()
}, { immediate: true })
</script>
