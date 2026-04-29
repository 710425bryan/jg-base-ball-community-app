<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { useAuthStore } from '@/stores/auth'
import { useEquipmentPaymentsStore } from '@/stores/equipmentPayments'
import {
  EQUIPMENT_REQUEST_STATUS,
  getEquipmentRequestStatusLabel
} from '@/utils/equipmentRequestStatus'
import {
  normalizeAccountLast5,
  PAYMENT_METHOD_OPTIONS,
  requiresAccountLast5
} from '@/utils/paymentMethods'
import { buildGroupedPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

const props = defineProps<{
  memberId?: string | null
}>()

const route = useRoute()
const authStore = useAuthStore()
const paymentsStore = useEquipmentPaymentsStore()
const formRef = ref()
const isDialogOpen = ref(false)
const selectedTransactionIds = ref<string[]>([])

const form = reactive({
  payment_method: '',
  account_last_5: '',
  remittance_date: dayjs().format('YYYY-MM-DD'),
  note: ''
})

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS
const requiresLast5 = computed(() => requiresAccountLast5(form.payment_method))

const pendingRequestItems = computed(() => paymentsStore.myPendingRequestItems)

const unpaidItems = computed(() =>
  paymentsStore.myItems.filter((item) => item.payment_status === 'unpaid')
)

const pendingItems = computed(() =>
  paymentsStore.myItems.filter((item) => item.payment_status === 'pending_review')
)

const paidItems = computed(() =>
  paymentsStore.myItems.filter((item) => item.payment_status === 'paid')
)

const hasAnyItems = computed(() =>
  pendingRequestItems.value.length > 0 || paymentsStore.myItems.length > 0
)

const selectedItems = computed(() =>
  paymentsStore.myItems.filter((item) => selectedTransactionIds.value.includes(item.transaction_id))
)

const selectedTotal = computed(() =>
  selectedItems.value.reduce((total, item) => total + Number(item.total_amount || 0), 0)
)

const rules = {
  payment_method: [{ required: true, message: '請選擇匯款方式', trigger: 'change' }],
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
  remittance_date: [{ required: true, message: '請選擇匯款日期', trigger: 'change' }]
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

const getRequestStatusClass = (status?: string | null) => {
  if (status === EQUIPMENT_REQUEST_STATUS.PENDING) {
    return 'bg-amber-50 border-amber-200 text-amber-700'
  }

  if (status === EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP) {
    return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  }

  return 'bg-blue-50 border-blue-200 text-blue-700'
}

const loadItems = async () => {
  await paymentsStore.loadMyItems(props.memberId || null)
  await highlightFromRoute()
}

const openDialog = () => {
  if (selectedTransactionIds.value.length === 0) {
    ElMessage.warning('請先勾選要回報付款的裝備項目')
    return
  }
  form.payment_method = authStore.profile?.preferred_payment_method || paymentMethodOptions[0]
  form.account_last_5 = requiresAccountLast5(form.payment_method)
    ? authStore.profile?.preferred_account_last_5 || ''
    : ''
  form.remittance_date = dayjs().format('YYYY-MM-DD')
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

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    try {
      const submission = await paymentsStore.submitPayment({
        transaction_ids: selectedTransactionIds.value,
        payment_method: form.payment_method,
        account_last_5: requiresLast5.value ? form.account_last_5 : null,
        remittance_date: form.remittance_date,
        note: form.note || null
      })

      await dispatchPushNotification({
        title: '收到裝備付款回報',
        body: `${submission.member_name} 回報裝備付款 ${formatCurrency(submission.amount)}，請協助確認。`,
        url: `/fees?tab=equipment&highlight_submission_id=${submission.id}`,
        feature: 'fees',
        action: 'EDIT',
        eventKey: buildGroupedPushEventKey('equipment-payment-submitted', selectedTransactionIds.value)
      })

      selectedTransactionIds.value = []
      isDialogOpen.value = false
      ElMessage.success('已送出裝備付款回報')
      await loadItems()
    } catch (error: any) {
      ElMessage.error(error?.message || '送出裝備付款回報失敗')
    }
  })
}

const highlightFromRoute = async () => {
  const requestId = String(route.query.highlight_id || '').trim()
  const submissionId = String(route.query.highlight_submission_id || '').trim()
  const transactionId = String(route.query.highlight_transaction_id || '').trim()
  if (!requestId && !submissionId && !transactionId) return

  await nextTick()
  const selector = requestId
    ? `[data-equipment-request-id="${requestId}"]`
    : submissionId
      ? `[data-equipment-submission-id="${submissionId}"]`
      : `[data-equipment-transaction-id="${transactionId}"]`
  const target = document.querySelector(selector) as HTMLElement | null
  if (!target) return

  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
  window.setTimeout(() => target.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2600)
}

watch(() => props.memberId, () => {
  selectedTransactionIds.value = []
  void loadItems()
}, { immediate: true })

watch(() => route.query.highlight_id, () => {
  void highlightFromRoute()
})

watch(() => route.query.highlight_submission_id, () => {
  void highlightFromRoute()
})

watch(() => route.query.highlight_transaction_id, () => {
  void highlightFromRoute()
})
</script>

<template>
  <section class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
    <div class="px-5 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h3 class="text-lg font-black text-slate-800">裝備待付款</h3>
        <p class="text-xs text-gray-400 mt-1">已領取的裝備加購與管理員新增的購買項目會列在這裡，可勾選後送出付款回報。</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-2xl border border-gray-200 px-4 py-2 font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors disabled:opacity-70"
          :disabled="paymentsStore.isLoading"
          @click="loadItems"
        >
          {{ paymentsStore.isLoading ? '更新中...' : '重新整理' }}
        </button>
        <button
          type="button"
          class="rounded-2xl bg-primary px-4 py-2 font-bold text-white hover:bg-primary-hover transition-colors disabled:opacity-70"
          :disabled="selectedTransactionIds.length === 0 || paymentsStore.isSaving"
          @click="openDialog"
        >
          回報付款
        </button>
      </div>
    </div>

    <AppLoadingState v-if="paymentsStore.isLoading" text="讀取裝備付款資料中..." min-height="8rem" />

    <div v-else-if="!hasAnyItems" class="p-6 text-sm text-gray-400 font-bold">
      目前沒有裝備付款項目。
    </div>

    <div v-else class="p-4 md:p-5 space-y-4">
      <div v-if="pendingRequestItems.length > 0" class="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
        <div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div class="font-black text-blue-700">待審核 / 尚未可付款</div>
          <div class="text-xs font-bold text-blue-500">核准後會移到待付款，可先完成付款回報</div>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <article
            v-for="item in pendingRequestItems"
            :key="item.request_item_id"
            :data-equipment-request-id="item.request_id || undefined"
            class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="font-black text-slate-800">{{ item.equipment_name }}</div>
                <p class="mt-1 text-xs text-gray-400">
                  {{ item.member_name }}｜{{ item.size || '無尺寸' }}｜{{ formatDate(item.ready_at || item.approved_at || item.requested_at) }}
                </p>
              </div>
              <span :class="getRequestStatusClass(item.request_status)" class="shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold">
                {{ getEquipmentRequestStatusLabel(item.request_status) }}
              </span>
            </div>
            <div class="mt-3 flex items-center justify-between gap-3 text-sm">
              <span class="text-gray-500">{{ item.quantity }} 件 x {{ formatCurrency(item.unit_price) }}</span>
              <span class="font-black text-primary">{{ formatCurrency(item.total_amount) }}</span>
            </div>
          </article>
        </div>
      </div>

      <div v-if="unpaidItems.length > 0" class="rounded-2xl border border-red-100 bg-red-50/50 p-4">
        <div class="mb-3 font-black text-red-700">待付款</div>
        <div class="grid gap-3 md:grid-cols-2">
          <label
            v-for="item in unpaidItems"
            :key="item.transaction_id"
            :data-equipment-request-id="item.request_id || undefined"
            :data-equipment-transaction-id="item.transaction_id"
            class="flex cursor-pointer gap-3 rounded-2xl border border-white bg-white/90 p-4 shadow-sm transition-all hover:border-primary/30"
          >
            <input
              v-model="selectedTransactionIds"
              type="checkbox"
              :value="item.transaction_id"
              class="mt-1 h-5 w-5 rounded border-gray-300 text-primary"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <div class="font-black text-slate-800">{{ item.equipment_name }}</div>
                <div class="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <span
                    v-if="item.request_status"
                    :class="getRequestStatusClass(item.request_status)"
                    class="rounded-full border px-2.5 py-1 text-xs font-bold"
                  >
                    {{ getEquipmentRequestStatusLabel(item.request_status) }}
                  </span>
                  <span :class="getPaymentStatusClass(item.payment_status)" class="rounded-full border px-2.5 py-1 text-xs font-bold">
                    {{ getPaymentStatusLabel(item.payment_status) }}
                  </span>
                </div>
              </div>
              <p class="mt-1 text-xs text-gray-400">{{ item.member_name }}｜{{ item.size || '無尺寸' }}｜{{ formatDate(item.transaction_date) }}</p>
              <div class="mt-3 flex items-center justify-between gap-3 text-sm">
                <span class="text-gray-500">{{ item.quantity }} 件 x {{ formatCurrency(item.unit_price) }}</span>
                <span class="font-black text-primary">{{ formatCurrency(item.total_amount) }}</span>
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
            :key="item.transaction_id"
            :data-equipment-submission-id="item.payment_submission_id || undefined"
            :data-equipment-transaction-id="item.transaction_id"
            class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm"
          >
            <div class="font-black text-slate-800">{{ item.equipment_name }}</div>
            <p class="mt-1 text-xs text-gray-400">{{ item.member_name }}｜{{ item.size || '無尺寸' }}｜{{ item.quantity }} 件</p>
            <div v-if="item.request_status" class="mt-3">
              <span :class="getRequestStatusClass(item.request_status)" class="rounded-full border px-2.5 py-1 text-xs font-bold">
                {{ getEquipmentRequestStatusLabel(item.request_status) }}
              </span>
            </div>
            <p class="mt-3 font-black text-primary">{{ formatCurrency(item.total_amount) }}</p>
          </article>
        </div>
      </div>

      <div v-if="paidItems.length > 0" class="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
        <div class="mb-3 font-black text-emerald-700">已確認</div>
        <div class="grid gap-3 md:grid-cols-2">
          <article
            v-for="item in paidItems.slice(0, 6)"
            :key="item.transaction_id"
            :data-equipment-submission-id="item.payment_submission_id || undefined"
            :data-equipment-transaction-id="item.transaction_id"
            class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm"
          >
            <div class="font-black text-slate-800">{{ item.equipment_name }}</div>
            <p class="mt-1 text-xs text-gray-400">{{ item.member_name }}｜{{ item.size || '無尺寸' }}｜{{ item.quantity }} 件</p>
            <div v-if="item.request_status" class="mt-3">
              <span :class="getRequestStatusClass(item.request_status)" class="rounded-full border px-2.5 py-1 text-xs font-bold">
                {{ getEquipmentRequestStatusLabel(item.request_status) }}
              </span>
            </div>
            <p class="mt-3 font-black text-emerald-700">{{ formatCurrency(item.total_amount) }}</p>
          </article>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="isDialogOpen"
      title="裝備付款回報"
      width="90%"
      style="max-width: 560px; border-radius: 16px;"
      destroy-on-close
    >
      <div class="mb-4 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-primary/70">回報金額</div>
        <div class="mt-2 text-2xl font-black text-primary">{{ formatCurrency(selectedTotal) }}</div>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <el-form-item label="匯款方式" prop="payment_method" class="font-bold">
            <el-select
              v-model="form.payment_method"
              class="w-full"
              size="large"
              placeholder="請選擇匯款方式"
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

        <el-form-item label="匯款日期" prop="remittance_date" class="font-bold">
          <el-date-picker
            v-model="form.remittance_date"
            type="date"
            value-format="YYYY-MM-DD"
            class="!w-full"
            size="large"
          />
        </el-form-item>

        <el-form-item label="備註" prop="note" class="font-bold">
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
            :disabled="paymentsStore.isSaving"
            @click="submit"
          >
            {{ paymentsStore.isSaving ? '送出中...' : '送出付款回報' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </section>
</template>
