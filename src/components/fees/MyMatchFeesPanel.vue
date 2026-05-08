<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import PaymentAccountInfoCard from '@/components/payments/PaymentAccountInfoCard.vue'
import PaymentSubmissionSummary from '@/components/payments/PaymentSubmissionSummary.vue'
import { useAuthStore } from '@/stores/auth'
import { getPlayerBalance } from '@/services/playerBalances'
import { createMatchPaymentSubmission, listMyMatchFeeItems } from '@/services/matchFees'
import type { MatchFeeItem } from '@/types/matchFees'
import {
  BALANCE_PAYMENT_METHOD,
  normalizeAccountLast5,
  PAYMENT_METHOD_OPTIONS,
  requiresAccountLast5
} from '@/utils/paymentMethods'
import {
  clampBalanceDeduction,
  getExternalPaymentAmount
} from '@/utils/playerBalance'
import { buildGroupedPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

const props = withDefaults(defineProps<{
  memberId?: string | null
  selectedItemIds?: string[]
  unifiedMode?: boolean
}>(), {
  unifiedMode: false
})

type PaymentPanelSummary = {
  unpaidCount: number
  unpaidTotal: number
  pendingCount: number
  pendingTotal: number
  firstUnpaidItemId: string | null
}

type MatchFeeItemsPayload = {
  memberId: string | null
  items: MatchFeeItem[]
  currentBalance: number
}

const emit = defineEmits<{
  (event: 'summary', payload: PaymentPanelSummary): void
  (event: 'items', payload: MatchFeeItemsPayload): void
  (event: 'update:selectedItemIds', payload: string[]): void
}>()

const route = useRoute()
const authStore = useAuthStore()
const formRef = ref()
const isLoading = ref(false)
const isSaving = ref(false)
const isDialogOpen = ref(false)
const items = ref<MatchFeeItem[]>([])
const localSelectedItemIds = ref<string[]>([])
const currentBalance = ref(0)
const loadError = ref('')

const selectedItemIds = computed({
  get: () => props.selectedItemIds ?? localSelectedItemIds.value,
  set: (value: string[]) => {
    if (props.selectedItemIds !== undefined) {
      emit('update:selectedItemIds', value)
      return
    }

    localSelectedItemIds.value = value
  }
})

const form = reactive({
  balance_amount: 0,
  payment_method: '',
  account_last_5: '',
  remittance_date: dayjs().format('YYYY-MM-DD'),
  note: ''
})

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const unpaidItems = computed(() => items.value.filter((item) => item.payment_status === 'unpaid'))
const pendingItems = computed(() => items.value.filter((item) => item.payment_status === 'pending_review'))
const paidItems = computed(() => items.value.filter((item) => item.payment_status === 'paid'))
const cancelledItems = computed(() => items.value.filter((item) => item.payment_status === 'cancelled'))
const hasAnyItems = computed(() => items.value.length > 0)

const summary = computed<PaymentPanelSummary>(() => ({
  unpaidCount: unpaidItems.value.length,
  unpaidTotal: unpaidItems.value.reduce((total, item) => total + Number(item.amount || 0), 0),
  pendingCount: pendingItems.value.length,
  pendingTotal: pendingItems.value.reduce((total, item) => total + Number(item.amount || 0), 0),
  firstUnpaidItemId: unpaidItems.value[0]?.id || null
}))

const selectedItems = computed(() =>
  items.value.filter((item) => selectedItemIds.value.includes(item.id))
)

const selectedTotal = computed(() =>
  selectedItems.value.reduce((total, item) => total + Number(item.amount || 0), 0)
)

const selectedPaymentLineItems = computed(() =>
  selectedItems.value.map((item) => ({
    id: item.id,
    typeLabel: '比賽費用',
    title: item.match_name,
    periodLabel: item.fee_month,
    meta: getMatchSubtitle(item),
    amount: Number(item.amount || 0)
  }))
)

const externalPaymentAmount = computed(() => getExternalPaymentAmount(selectedTotal.value, form.balance_amount))
const isExternalPaymentRequired = computed(() => externalPaymentAmount.value > 0)
const requiresLast5 = computed(() => isExternalPaymentRequired.value && requiresAccountLast5(form.payment_method))
const rules = {
  balance_amount: [
    {
      validator: (_rule: unknown, value: number, callback: (error?: Error) => void) => {
        const normalized = Number(value) || 0
        if (normalized < 0) {
          callback(new Error('餘額扣抵不能小於 0'))
          return
        }
        if (normalized > selectedTotal.value) {
          callback(new Error('餘額扣抵不能超過回報金額'))
          return
        }
        if (normalized > currentBalance.value) {
          callback(new Error('餘額不足'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  payment_method: [
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!isExternalPaymentRequired.value || value) {
          callback()
          return
        }
        callback(new Error('請選擇匯款方式'))
      },
      trigger: 'change'
    }
  ],
  account_last_5: [
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!requiresLast5.value) {
          callback()
          return
        }
        if (!/^\d{5}$/.test(value || '')) {
          callback(new Error('請輸入 5 位數字'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  remittance_date: [
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!isExternalPaymentRequired.value || value) {
          callback()
          return
        }
        callback(new Error('請選擇匯款日期'))
      },
      trigger: 'change'
    }
  ]
}

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
  return '待付款'
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

const loadItems = async () => {
  if (!props.memberId) {
    items.value = []
    currentBalance.value = 0
    loadError.value = ''
    return
  }

  isLoading.value = true
  loadError.value = ''
  try {
    const [nextItems, nextBalance] = await Promise.all([
      listMyMatchFeeItems(props.memberId),
      getPlayerBalance(props.memberId)
    ])
    items.value = nextItems
    currentBalance.value = nextBalance
    await highlightFromRoute()
  } catch (error: any) {
    loadError.value = error?.message || '讀取比賽費用失敗'
    ElMessage.error(loadError.value)
  } finally {
    isLoading.value = false
  }
}

const openDialog = () => {
  if (selectedItemIds.value.length === 0) {
    ElMessage.warning('請先勾選要回報付款的比賽費用')
    return
  }

  form.payment_method = authStore.profile?.preferred_payment_method || paymentMethodOptions[0]
  form.account_last_5 = requiresAccountLast5(form.payment_method)
    ? authStore.profile?.preferred_account_last_5 || ''
    : ''
  form.remittance_date = dayjs().format('YYYY-MM-DD')
  form.balance_amount = 0
  form.note = ''
  isDialogOpen.value = true
  void nextTick(() => formRef.value?.clearValidate?.())
}

const handlePaymentMethodChange = (value: string | undefined) => {
  if (!requiresAccountLast5(value)) {
    form.account_last_5 = ''
  }
  formRef.value?.clearValidate?.('account_last_5')
}

const handleAccountLast5Input = (value: string) => {
  form.account_last_5 = normalizeAccountLast5(value)
}

const submit = async () => {
  if (!formRef.value) return

  form.balance_amount = clampBalanceDeduction(form.balance_amount, selectedTotal.value, currentBalance.value)

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    isSaving.value = true
    try {
      const submission = await createMatchPaymentSubmission({
        match_fee_item_ids: selectedItemIds.value,
        payment_method: isExternalPaymentRequired.value ? form.payment_method : BALANCE_PAYMENT_METHOD,
        account_last_5: requiresLast5.value ? form.account_last_5 : null,
        remittance_date: isExternalPaymentRequired.value ? form.remittance_date : dayjs().format('YYYY-MM-DD'),
        note: form.note || null,
        balance_amount: form.balance_amount
      })

      await dispatchPushNotification({
        title: '收到比賽費用付款回報',
        body: `${submission.member_name} 回報比賽費用 ${formatCurrency(submission.amount)}，請協助確認。`,
        url: `/fees?tab=match-fees&highlight_match_submission_id=${submission.id}`,
        feature: 'fees',
        action: 'EDIT',
        eventKey: buildGroupedPushEventKey('match-fee-payment-submitted', selectedItemIds.value)
      })

      selectedItemIds.value = []
      isDialogOpen.value = false
      ElMessage.success('已送出比賽費用付款回報')
      await loadItems()
    } catch (error: any) {
      ElMessage.error(error?.message || '送出比賽費用付款回報失敗')
    } finally {
      isSaving.value = false
    }
  })
}

const highlightFromRoute = async () => {
  const submissionId = String(route.query.highlight_match_submission_id || '').trim()
  const itemId = String(route.query.highlight_match_fee_item_id || '').trim()
  if (!submissionId && !itemId) return

  await nextTick()
  const selector = submissionId
    ? `[data-match-fee-submission-id="${submissionId}"]`
    : `[data-match-fee-item-id="${itemId}"]`
  const target = document.querySelector(selector) as HTMLElement | null
  if (!target) return

  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
  window.setTimeout(() => target.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2600)
}

watch(() => props.memberId, () => {
  selectedItemIds.value = []
  void loadItems()
}, { immediate: true })

watch([selectedTotal, currentBalance], () => {
  form.balance_amount = clampBalanceDeduction(form.balance_amount, selectedTotal.value, currentBalance.value)
})

watch(() => route.query.highlight_match_submission_id, () => {
  void highlightFromRoute()
})

watch(() => route.query.highlight_match_fee_item_id, () => {
  void highlightFromRoute()
})

watch(summary, (nextSummary) => {
  emit('summary', nextSummary)
}, { immediate: true })

watch(
  [items, currentBalance],
  () => {
    emit('items', {
      memberId: props.memberId || null,
      items: items.value,
      currentBalance: currentBalance.value
    })
  },
  { deep: true, immediate: true }
)

defineExpose({
  loadItems
})
</script>

<template>
  <section id="match-fees-section" class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
    <div class="px-5 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h3 class="text-lg font-black text-slate-800">比賽費用</h3>
        <p class="text-xs text-gray-400 mt-1">有設定比賽費用的場次會依出賽名單列在這裡，可勾選後送出付款回報。</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-2xl border border-gray-200 px-4 py-2 font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors disabled:opacity-70"
          :disabled="isLoading"
          @click="loadItems"
        >
          {{ isLoading ? '更新中...' : '重新整理' }}
        </button>
        <button
          v-if="!unifiedMode"
          type="button"
          class="rounded-2xl bg-primary px-4 py-2 font-bold text-white hover:bg-primary-hover transition-colors disabled:opacity-70"
          :disabled="selectedItemIds.length === 0 || isSaving"
          @click="openDialog"
        >
          回報付款
        </button>
        <span
          v-else
          class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600"
        >
          已選 {{ selectedItemIds.length }} 筆
        </span>
      </div>
    </div>

    <AppLoadingState v-if="isLoading" text="讀取比賽費用中..." min-height="8rem" />

    <div v-else-if="loadError" class="p-6 text-sm font-bold text-red-500">
      {{ loadError }}
    </div>

    <div v-else-if="!hasAnyItems" class="p-6 text-sm text-gray-400 font-bold">
      目前沒有比賽費用項目。
    </div>

    <div v-else class="p-4 md:p-5 space-y-4">
      <div v-if="unpaidItems.length > 0" class="rounded-2xl border border-red-100 bg-red-50/50 p-4">
        <div class="mb-3 font-black text-red-700">待付款</div>
        <div class="grid gap-3 md:grid-cols-2">
          <label
            v-for="item in unpaidItems"
            :key="item.id"
            :data-match-fee-item-id="item.id"
            class="flex cursor-pointer gap-3 rounded-2xl border border-white bg-white/90 p-4 shadow-sm transition-all hover:border-primary/30"
          >
            <input
              v-model="selectedItemIds"
              type="checkbox"
              :value="item.id"
              class="mt-1 h-5 w-5 rounded border-gray-300 text-primary"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <div class="font-black text-slate-800">{{ item.match_name }}</div>
                <span :class="getPaymentStatusClass(item.payment_status)" class="shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold">
                  {{ getPaymentStatusLabel(item.payment_status) }}
                </span>
              </div>
              <p class="mt-1 text-xs text-gray-400">{{ getMatchSubtitle(item) }}</p>
              <div class="mt-3 flex items-center justify-between gap-3 text-sm">
                <span class="text-gray-500">{{ item.fee_month }}</span>
                <span class="font-black text-primary">{{ formatCurrency(item.amount) }}</span>
              </div>
            </div>
          </label>
        </div>
      </div>

      <div v-if="pendingItems.length > 0" class="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
        <div class="mb-3 font-black text-amber-700">待確認</div>
        <div class="grid gap-3 md:grid-cols-2">
          <article
            v-for="item in pendingItems"
            :key="item.id"
            :data-match-fee-submission-id="item.payment_submission_id || undefined"
            :data-match-fee-item-id="item.id"
            class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm"
          >
            <div class="font-black text-slate-800">{{ item.match_name }}</div>
            <p class="mt-1 text-xs text-gray-400">{{ getMatchSubtitle(item) }}</p>
            <p class="mt-3 font-black text-primary">{{ formatCurrency(item.amount) }}</p>
          </article>
        </div>
      </div>

      <div v-if="paidItems.length > 0" class="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
        <div class="mb-3 font-black text-emerald-700">已確認</div>
        <div class="grid gap-3 md:grid-cols-2">
          <article
            v-for="item in paidItems.slice(0, 6)"
            :key="item.id"
            :data-match-fee-submission-id="item.payment_submission_id || undefined"
            :data-match-fee-item-id="item.id"
            class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm"
          >
            <div class="font-black text-slate-800">{{ item.match_name }}</div>
            <p class="mt-1 text-xs text-gray-400">{{ getMatchSubtitle(item) }}</p>
            <p class="mt-3 font-black text-emerald-700">{{ formatCurrency(item.amount) }}</p>
          </article>
        </div>
      </div>

      <div v-if="cancelledItems.length > 0" class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
        <div class="mb-3 font-black text-gray-600">已取消</div>
        <div class="grid gap-3 md:grid-cols-2">
          <article
            v-for="item in cancelledItems.slice(0, 4)"
            :key="item.id"
            class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm"
          >
            <div class="font-black text-slate-700">{{ item.match_name }}</div>
            <p class="mt-1 text-xs text-gray-400">{{ getMatchSubtitle(item) }}</p>
            <p class="mt-2 text-xs font-bold text-gray-500">{{ item.cancelled_reason || '已取消收費' }}</p>
          </article>
        </div>
      </div>
    </div>

    <el-dialog
      v-if="!unifiedMode"
      v-model="isDialogOpen"
      title="比賽費用付款回報"
      width="90%"
      style="max-width: 560px; border-radius: 16px;"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <el-form-item label="匯款日期" prop="remittance_date" class="font-bold">
            <el-date-picker
              v-model="form.remittance_date"
              type="date"
              value-format="YYYY-MM-DD"
              class="!w-full"
              size="large"
              :disabled="!isExternalPaymentRequired"
            />
          </el-form-item>

          <el-form-item label="匯款方式" prop="payment_method" class="font-bold">
            <el-select
              v-model="form.payment_method"
              class="w-full"
              size="large"
              placeholder="請選擇匯款方式"
              :disabled="!isExternalPaymentRequired"
              @change="handlePaymentMethodChange"
            >
              <el-option v-for="option in paymentMethodOptions" :key="option" :label="option" :value="option" />
            </el-select>
          </el-form-item>

          <el-form-item label="帳號後五碼" prop="account_last_5" class="font-bold">
            <el-input
              :model-value="form.account_last_5"
              size="large"
              maxlength="5"
              :disabled="!requiresLast5"
              placeholder="請輸入後五碼"
              @input="handleAccountLast5Input"
            />
          </el-form-item>
        </div>

        <PaymentAccountInfoCard compact />

        <PaymentSubmissionSummary
          v-model:balance-amount="form.balance_amount"
          :member-name="selectedItems[0]?.member_name || ''"
          :total-amount="selectedTotal"
          :available-balance="currentBalance"
          :external-amount="externalPaymentAmount"
          :line-items="selectedPaymentLineItems"
          line-items-title="比賽費用清單"
          empty-items-text="請先勾選要回報付款的比賽費用。"
          :format-currency="formatCurrency"
        />

        <el-form-item label="備註說明（選填）" prop="note" class="font-bold">
          <el-input v-model="form.note" type="textarea" :rows="3" maxlength="120" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class="rounded-2xl border border-gray-200 px-5 py-3 font-bold text-gray-600 hover:border-gray-300 hover:text-gray-800 transition-colors"
            @click="isDialogOpen = false"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:bg-primary-hover transition-colors disabled:opacity-70"
            :disabled="isSaving"
            @click="submit"
          >
            {{ isSaving ? '送出中...' : '送出付款回報' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>
