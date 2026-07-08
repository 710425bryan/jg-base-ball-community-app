<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { BellFilled, CircleCheckFilled, Promotion, Refresh, WarningFilled } from '@element-plus/icons-vue'
import {
  previewFeePaymentReminders,
  sendFeePaymentReminderTest,
  sendFeePaymentReminders
} from '@/services/feePaymentReminders'
import type {
  FeePaymentReminderCategory,
  FeePaymentReminderDispatchRequest,
  FeePaymentReminderDispatchResult
} from '@/types/feePaymentReminders'
import {
  FEE_PAYMENT_REMINDER_CATEGORIES,
  FEE_PAYMENT_REMINDER_CATEGORY_LABELS,
  buildQuarterlyReminderPeriodOptions,
  formatFeePaymentReminderCurrency,
  getDefaultFeePaymentReminderPeriods
} from '@/utils/feePaymentReminders'

const props = withDefaults(defineProps<{
  modelValue: boolean
  isAdmin?: boolean
}>(), {
  isAdmin: false
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const categoryDescriptions: Record<FeePaymentReminderCategory, string> = {
  chunggang_school_team: '校隊，且非新泰校隊',
  xintai_school_team: '校隊，訓練項目為新泰校隊',
  community: '球員身分的月費或季費'
}

const categoryOptions = FEE_PAYMENT_REMINDER_CATEGORIES.map((value) => ({
  value,
  label: FEE_PAYMENT_REMINDER_CATEGORY_LABELS[value],
  description: categoryDescriptions[value]
}))

const quarterOptions = buildQuarterlyReminderPeriodOptions()
const selectedCategories = ref<FeePaymentReminderCategory[]>([...FEE_PAYMENT_REMINDER_CATEGORIES])
const monthlyPeriod = ref('')
const quarterlyPeriod = ref('')
const previewResult = ref<FeePaymentReminderDispatchResult | null>(null)
const errorMessage = ref('')
const isPreviewing = ref(false)
const isSending = ref(false)
const isTesting = ref(false)
let previewRequestId = 0

const selectedCategoryLabels = computed(() =>
  selectedCategories.value.map((category) => FEE_PAYMENT_REMINDER_CATEGORY_LABELS[category]).join('、')
)

const hasValidRequest = computed(() =>
  selectedCategories.value.length > 0 && Boolean(monthlyPeriod.value) && Boolean(quarterlyPeriod.value)
)

const hasPreviewTargets = computed(() => (previewResult.value?.target_user_count || 0) > 0)

const summaryItems = computed(() => [
  { label: '未繳球員', value: String(previewResult.value?.member_count || 0) },
  { label: '通知帳號', value: String(previewResult.value?.target_user_count || 0) },
  { label: '可推播裝置', value: String(previewResult.value?.subscription_count || 0) },
  { label: '未繳合計', value: formatFeePaymentReminderCurrency(previewResult.value?.total_amount || 0) }
])

const previewTargets = computed(() => previewResult.value?.targets || [])

const formatMonthlyPeriodLabel = (period: string) => {
  const [year, month] = period.split('-')
  return year && month ? `${year} 年 ${Number(month)} 月` : period
}

const formatQuarterlyPeriodLabel = (period: string) => {
  const matched = period.match(/^(\d{4})-Q([1-4])$/)
  return matched ? `${matched[1]} 年第 ${matched[2]} 季` : period
}

const resetForm = () => {
  const periods = getDefaultFeePaymentReminderPeriods()
  selectedCategories.value = [...FEE_PAYMENT_REMINDER_CATEGORIES]
  monthlyPeriod.value = periods.monthly_period
  quarterlyPeriod.value = periods.quarterly_period
  previewResult.value = null
  errorMessage.value = ''
}

const buildRequest = (): FeePaymentReminderDispatchRequest | null => {
  if (!hasValidRequest.value) return null

  return {
    categories: [...selectedCategories.value],
    monthly_period: monthlyPeriod.value,
    quarterly_period: quarterlyPeriod.value
  }
}

const loadPreview = async () => {
  const request = buildRequest()
  if (!request) {
    previewResult.value = null
    errorMessage.value = '請至少選擇一個催繳分類與完整期間。'
    return
  }

  const requestId = ++previewRequestId
  isPreviewing.value = true
  errorMessage.value = ''

  try {
    const result = await previewFeePaymentReminders(request)
    if (requestId !== previewRequestId) return
    previewResult.value = result
  } catch (error: any) {
    if (requestId !== previewRequestId) return
    previewResult.value = null
    errorMessage.value = error?.message || '預覽催繳名單失敗，請稍後再試。'
  } finally {
    if (requestId === previewRequestId) {
      isPreviewing.value = false
    }
  }
}

const handleSend = async () => {
  const request = buildRequest()
  if (!request || !previewResult.value) {
    ElMessage.warning('請先完成催繳預覽')
    return
  }

  if (!hasPreviewTargets.value) {
    ElMessage.warning('目前沒有符合條件的未繳帳號')
    return
  }

  try {
    await ElMessageBox.confirm(
      `將針對 ${selectedCategoryLabels.value} 發送 ${formatMonthlyPeriodLabel(request.monthly_period)} 月費與 ${formatQuarterlyPeriodLabel(request.quarterly_period)} 季費催繳通知，共 ${previewResult.value.target_user_count || 0} 個帳號。`,
      '確認發送催繳通知',
      {
        confirmButtonText: '發送通知',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  isSending.value = true
  try {
    const result = await sendFeePaymentReminders(request)
    previewResult.value = result
    const sentCount = result.dispatched_count || 0
    const createdCount = result.created_count || 0

    if (sentCount > 0) {
      ElMessage.success(`已建立 ${createdCount} 筆催繳事件，並發送 ${sentCount} 個推播裝置。`)
    } else if ((result.duplicate_count || 0) > 0) {
      ElMessage.warning('今日相同條件已發送過，已略過重複通知。')
    } else {
      ElMessage.warning('已完成催繳處理，但目前沒有可推播裝置。')
    }
  } catch (error: any) {
    ElMessage.error(`發送催繳通知失敗：${error?.message || '請稍後再試'}`)
  } finally {
    isSending.value = false
  }
}

const handleTest = async () => {
  const request = buildRequest()
  if (!request) {
    ElMessage.warning('請先選擇催繳分類與期間')
    return
  }

  isTesting.value = true
  try {
    const result = await sendFeePaymentReminderTest(request)
    if ((result.dispatched_count || 0) > 0) {
      ElMessage.success('已發送測試通知給目前管理員。')
    } else {
      ElMessage.warning('已建立測試通知，但目前管理員沒有可推播裝置。')
    }
  } catch (error: any) {
    ElMessage.error(`發送測試通知失敗：${error?.message || '請稍後再試'}`)
  } finally {
    isTesting.value = false
  }
}

watch(
  () => props.modelValue,
  (nextVisible) => {
    if (nextVisible) {
      resetForm()
      void loadPreview()
    }
  }
)

watch(
  [selectedCategories, monthlyPeriod, quarterlyPeriod],
  () => {
    if (visible.value) {
      void loadPreview()
    }
  },
  { deep: true }
)
</script>

<template>
  <el-dialog
    v-model="visible"
    title="發送催繳通知"
    width="760px"
    destroy-on-close
    class="fee-payment-reminder-dialog"
  >
    <div class="space-y-5">
      <el-alert
        type="info"
        :closable="false"
        show-icon
      >
        <div class="text-sm leading-relaxed">
          只會手動發送一次瀏覽器通知，不會建立自動排程。正式催繳只包含月費與季費，通知會導向「我的繳費」。
        </div>
      </el-alert>

      <section class="space-y-3">
        <div class="flex items-center gap-2 text-sm font-black text-gray-700">
          <el-icon class="text-primary"><BellFilled /></el-icon>
          <span>發送對象</span>
        </div>

        <el-checkbox-group v-model="selectedCategories" class="fee-reminder-category-grid">
          <label
            v-for="option in categoryOptions"
            :key="option.value"
            class="fee-reminder-category-option"
            :class="{ 'fee-reminder-category-option--active': selectedCategories.includes(option.value) }"
          >
            <el-checkbox :value="option.value" class="!mr-0" />
            <span class="min-w-0">
              <span class="block text-sm font-black text-gray-800">{{ option.label }}</span>
              <span class="mt-1 block text-xs leading-relaxed text-gray-500">{{ option.description }}</span>
            </span>
          </label>
        </el-checkbox-group>
      </section>

      <section class="grid gap-3 md:grid-cols-2">
        <label class="space-y-2">
          <span class="block text-sm font-black text-gray-700">月費月份</span>
          <el-date-picker
            v-model="monthlyPeriod"
            type="month"
            value-format="YYYY-MM"
            format="YYYY 年 MM 月"
            class="!w-full"
            placeholder="選擇月費月份"
          />
        </label>

        <label class="space-y-2">
          <span class="block text-sm font-black text-gray-700">季費季度</span>
          <el-select
            v-model="quarterlyPeriod"
            class="!w-full"
            placeholder="選擇季費季度"
          >
            <el-option
              v-for="option in quarterOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </label>
      </section>

      <section
        v-loading="isPreviewing"
        class="rounded-lg border border-gray-200 bg-white p-4"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-sm font-black text-gray-700">
              <el-icon class="text-primary"><CircleCheckFilled /></el-icon>
              <span>預覽結果</span>
            </div>
            <p class="mt-1 text-xs leading-relaxed text-gray-500">
              系統會依目前選擇重新計算尚未繳款的月費與季費。
            </p>
          </div>
          <el-button
            plain
            :icon="Refresh"
            :loading="isPreviewing"
            @click="loadPreview"
          >
            重新預覽
          </el-button>
        </div>

        <el-alert
          v-if="errorMessage"
          class="mt-4"
          type="error"
          :closable="false"
          show-icon
          :title="errorMessage"
        />

        <div v-else class="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div
            v-for="item in summaryItems"
            :key="item.label"
            class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3"
          >
            <p class="text-xs font-bold text-gray-500">{{ item.label }}</p>
            <p class="mt-1 text-lg font-black text-gray-900">{{ item.value }}</p>
          </div>
        </div>

        <el-alert
          v-if="!errorMessage && previewResult && !hasPreviewTargets"
          class="mt-4"
          type="success"
          :closable="false"
          show-icon
          title="目前沒有符合條件的未繳款項。"
        />

        <el-alert
          v-else-if="!errorMessage && previewResult && (previewResult.subscription_count || 0) === 0"
          class="mt-4"
          type="warning"
          :closable="false"
          show-icon
          title="找到未繳帳號，但目前沒有可推播裝置。通知中心事件仍可建立。"
        />

        <div v-if="previewTargets.length" class="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
          <div
            v-for="(target, index) in previewTargets"
            :key="target.user_id || index"
            class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3"
          >
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div class="min-w-0">
                <p class="text-sm font-black text-gray-800">
                  接收帳號 {{ index + 1 }}
                </p>
                <p class="mt-1 text-xs leading-relaxed text-gray-500">
                  {{ target.member_names.join('、') || '未命名球員' }}
                </p>
              </div>
              <p class="shrink-0 text-sm font-black text-primary">
                {{ formatFeePaymentReminderCurrency(target.total_amount) }}
              </p>
            </div>

            <div class="mt-2 flex flex-wrap gap-1.5">
              <el-tag
                v-for="item in target.items"
                :key="`${item.billing_type}-${item.fee_id}`"
                size="small"
                type="warning"
                effect="plain"
              >
                {{ item.billing_type === 'monthly' ? '月費' : '季費' }} {{ item.period_label }}
              </el-tag>
            </div>
          </div>
        </div>
      </section>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
      >
        <template #title>
          <span class="inline-flex items-center gap-1">
            <el-icon><WarningFilled /></el-icon>
            <span>發送前請確認期間與分類</span>
          </span>
        </template>
        <div class="text-sm leading-relaxed">
          同一天、同分類、同期間、同接收帳號只會建立一次催繳事件，避免重複打擾家長或球員。
        </div>
      </el-alert>
    </div>

    <template #footer>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <el-button
          v-if="isAdmin"
          plain
          type="info"
          :icon="Promotion"
          :loading="isTesting"
          :disabled="!hasValidRequest || isSending"
          @click="handleTest"
        >
          發送測試通知
        </el-button>
        <span v-else />

        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <el-button @click="visible = false">取消</el-button>
          <el-button
            type="warning"
            :icon="BellFilled"
            :loading="isSending"
            :disabled="!hasValidRequest || isPreviewing || !hasPreviewTargets"
            @click="handleSend"
          >
            發送催繳通知
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.fee-reminder-category-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 0.75rem;
}

.fee-reminder-category-option {
  display: flex;
  min-height: 5rem;
  cursor: pointer;
  align-items: flex-start;
  gap: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  padding: 0.875rem;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.fee-reminder-category-option:hover {
  border-color: rgba(245, 158, 11, 0.55);
  background: #fffbeb;
}

.fee-reminder-category-option--active {
  border-color: rgba(245, 158, 11, 0.8);
  background: #fffbeb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

:deep(.fee-reminder-category-option .el-checkbox__label) {
  display: none;
}

@media (min-width: 768px) {
  .fee-reminder-category-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
