<template>
  <section class="bg-amber-50/80 border border-amber-100 rounded-2xl p-4 md:p-5 shadow-sm">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 class="text-lg font-black text-amber-900">個人回報 / 待確認</h3>
          <p class="text-xs md:text-sm text-amber-700/80 mt-1">
            這裡顯示使用者從個人頁送出的付款回報；確認後會依月費或季費更新正式紀錄。
          </p>
        </div>

        <div class="flex items-center gap-2">
          <span class="rounded-full bg-white/80 border border-amber-200 px-3 py-1 text-xs font-black text-amber-700">
            待確認 {{ pendingSubmissions.length }} 筆
          </span>
          <button
            type="button"
            class="rounded-xl border border-amber-200 bg-white/80 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-white transition-colors disabled:opacity-70"
            :disabled="isLoading"
            @click="fetchSubmissions"
          >
            {{ isLoading ? '更新中...' : '重新整理' }}
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="text-sm text-amber-700/70 font-bold">
        讀取待確認回報中...
      </div>

      <div v-else-if="pendingSubmissions.length === 0" class="rounded-2xl bg-white/70 border border-white px-4 py-5 text-sm text-amber-700/70 font-bold">
        目前沒有待確認的個人付款回報。
      </div>

      <div v-else class="grid gap-3">
        <article
          v-for="submission in visiblePendingSubmissions"
          :key="submission.id"
          :id="`profile-payment-submission-${submission.id}`"
          class="rounded-2xl border border-white bg-white/80 px-4 py-4 shadow-sm"
        >
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <div class="text-base md:text-lg font-black text-slate-800">{{ submission.member_name }}</div>
                <span class="rounded-full bg-primary/10 border border-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary">
                  {{ getBillingModeLabel(submission) }}
                </span>
              </div>

              <div class="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">期別</div>
                  <div class="mt-1 font-bold text-slate-700">{{ submission.period_key }}</div>
                </div>
                <div class="md:col-span-2 xl:col-span-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">金額核對</div>
                    <span class="rounded-full border px-2.5 py-1 text-[11px] font-black" :class="getReconciliationClass(submission.reconciliation_status)">
                      {{ getReconciliationLabel(submission.reconciliation_status) }}
                    </span>
                  </div>
                  <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <div><div class="text-[11px] font-bold text-gray-400">系統應收</div><div class="font-mono font-black text-slate-700">{{ formatNullableCurrency(submission.expected_amount) }}</div></div>
                    <div><div class="text-[11px] font-bold text-gray-400">申請折抵</div><div class="font-mono font-black text-emerald-700">{{ formatCurrency(submission.balance_amount) }}</div></div>
                    <div><div class="text-[11px] font-bold text-gray-400">正確應付</div><div class="font-mono font-black text-sky-700">{{ formatNullableCurrency(submission.expected_external_amount) }}</div></div>
                    <div><div class="text-[11px] font-bold text-gray-400">實際付款</div><div class="font-mono font-black text-slate-800">{{ formatNullableCurrency(submission.reported_external_amount) }}</div></div>
                    <div><div class="text-[11px] font-bold text-gray-400">差額</div><div class="font-mono font-black" :class="submission.amount_difference === 0 ? 'text-emerald-700' : 'text-red-600'">{{ formatDifference(submission.amount_difference) }}</div></div>
                  </div>
                </div>
                <div>
                  <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">匯款資訊</div>
                  <div class="mt-1 font-bold text-slate-700">{{ formatPaymentInfo(submission) }}</div>
                </div>
                <div>
                  <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">送出時間</div>
                  <div class="mt-1 font-medium text-slate-700">{{ formatDateTime(submission.created_at) }}</div>
                </div>
              </div>

              <p v-if="submission.note" class="mt-3 text-sm text-gray-500 leading-relaxed">
                {{ submission.note }}
              </p>
              <p v-if="submission.amount_mismatch_reason" class="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-bold leading-relaxed text-amber-800">
                使用者異常說明：{{ submission.amount_mismatch_reason }}
              </p>

              <div v-if="submission.items && submission.items.length > 0" class="mt-4 grid gap-2">
                <article
                  v-for="item in submission.items"
                  :key="`${submission.id}-${item.member_id}`"
                  class="grid gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_repeat(3,7rem)] sm:items-center"
                >
                  <div class="min-w-0">
                    <div class="font-black text-slate-700">{{ item.member_name }}</div>
                    <div class="text-xs font-bold text-slate-400">{{ item.period_key }}</div>
                  </div>
                  <div class="font-mono font-black text-primary sm:text-right">
                    應收 {{ formatNullableCurrency(item.expected_amount) }}
                  </div>
                  <div class="text-xs font-bold text-slate-500 sm:text-right">
                    正確 {{ formatNullableCurrency(item.expected_external_amount) }}
                  </div>
                  <div class="text-xs font-bold text-slate-500 sm:text-right">
                    實付 {{ formatNullableCurrency(item.reported_external_amount) }}<br>
                    <span :class="item.amount_difference === 0 ? 'text-emerald-700' : 'text-red-600'">差額 {{ formatDifference(item.amount_difference) }}</span>
                  </div>
                </article>
              </div>
            </div>

            <div class="flex flex-row lg:flex-col gap-2 shrink-0">
              <button
                type="button"
                class="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 transition-colors disabled:opacity-70"
                :disabled="processingIds.has(submission.id) || !canApproveSubmission(submission)"
                :title="getApproveDisabledReason(submission)"
                @click="updateSubmissionStatus(submission, 'approved')"
              >
                確認收到
              </button>
              <button
                type="button"
                class="rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-2 transition-colors disabled:opacity-70"
                :disabled="processingIds.has(submission.id)"
                @click="openRejectDialog(submission)"
              >
                退回
              </button>
            </div>
          </div>
        </article>
      </div>

      <button
        v-if="pendingSubmissions.length > DEFAULT_VISIBLE_COUNT"
        type="button"
        class="self-start rounded-xl border border-amber-200 bg-white/80 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-white transition-colors"
        @click="isExpanded = !isExpanded"
      >
        {{ isExpanded ? '收合待確認清單' : `展開全部 (${pendingSubmissions.length} 筆)` }}
      </button>
    </div>

    <el-dialog v-model="isRejectDialogOpen" title="退回付款回報" width="90%" style="max-width: 520px; border-radius: 16px;" append-to-body>
      <el-form label-position="top" class="space-y-4">
        <el-form-item label="退回原因" required class="font-bold">
          <el-select v-model="rejectionPreset" class="w-full" size="large" placeholder="請選擇原因">
            <el-option v-for="option in rejectionReasonOptions" :key="option" :label="option" :value="option" />
          </el-select>
        </el-form-item>
        <el-form-item label="補充說明" :required="rejectionPreset === '其他'" class="font-bold">
          <el-input v-model="rejectionDetail" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="可補充正確付款方式或需要重新確認的資料" />
        </el-form-item>
      </el-form>
      <template #footer>
        <AppDialogFooter
          confirm-label="確認退回"
          danger
          :loading="Boolean(rejectingSubmission && processingIds.has(rejectingSubmission.id))"
          :confirm-disabled="!canSubmitRejection"
          @cancel="closeRejectDialog"
          @confirm="submitRejection"
        />
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute } from 'vue-router'
import { listProfilePaymentSubmissions, reviewMyPaymentSubmission } from '@/services/myPayments'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import type {
  MyPaymentReconciliationStatus,
  MyPaymentSubmissionItem,
  MyPaymentSubmissionStatus
} from '@/types/payments'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'
import { getPaymentReconciliationLabel } from '@/utils/paymentReconciliation'

type AdminPaymentSubmissionRow = {
  id: string
  profile_id?: string | null
  member_id: string
  billing_mode: 'monthly' | 'quarterly'
  period_key: string
  amount: number
  expected_amount: number | null
  balance_amount: number
  external_amount: number
  expected_external_amount: number | null
  reported_external_amount: number | null
  amount_difference: number | null
  reconciliation_status: MyPaymentReconciliationStatus
  amount_mismatch_reason: string | null
  rejection_reason: string | null
  payment_method: string
  account_last_5: string | null
  remittance_date: string | null
  note: string | null
  status: MyPaymentSubmissionStatus
  created_at: string
  updated_at: string
  member_name: string
  items?: MyPaymentSubmissionItem[]
}

const DEFAULT_VISIBLE_COUNT = 4

const route = useRoute()

const isLoading = ref(false)
const isExpanded = ref(false)
const processingIds = ref(new Set<string>())
const submissions = ref<AdminPaymentSubmissionRow[]>([])
const isRejectDialogOpen = ref(false)
const rejectingSubmission = ref<AdminPaymentSubmissionRow | null>(null)
const rejectionPreset = ref('')
const rejectionDetail = ref('')
const rejectionReasonOptions = ['金額不足', '金額超出', '餘額不足', '匯款資料不符', '其他']
const canSubmitRejection = computed(() => Boolean(
  rejectionPreset.value
  && (rejectionPreset.value !== '其他' || rejectionDetail.value.trim())
))

const pendingSubmissions = computed(() => {
  return submissions.value.filter((submission) => submission.status === 'pending_review')
})

const visiblePendingSubmissions = computed(() => {
  if (isExpanded.value) {
    return pendingSubmissions.value
  }

  return pendingSubmissions.value.slice(0, DEFAULT_VISIBLE_COUNT)
})

const getBillingModeLabel = (submission: AdminPaymentSubmissionRow) => {
  if (submission.items && submission.items.length > 0) {
    return `季費 ${submission.items.length} 人`
  }

  return submission.billing_mode === 'quarterly' ? '季費' : '月費'
}

const formatCurrency = (amount: number) => {
  const normalizedAmount = Number(amount) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(normalizedAmount)
}

const formatNullableCurrency = (amount?: number | null) =>
  amount == null ? '無法核對' : formatCurrency(amount)

const formatDifference = (amount?: number | null) => {
  if (amount == null) return '無法核對'
  const normalized = Number(amount) || 0
  return `${normalized > 0 ? '+' : ''}${formatCurrency(normalized)}`
}

const getReconciliationLabel = (status: MyPaymentReconciliationStatus) =>
  getPaymentReconciliationLabel(status || 'unverifiable')

const getReconciliationClass = (status: MyPaymentReconciliationStatus) => ({
  matched: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  underpaid: 'border-red-200 bg-red-50 text-red-700',
  overpaid: 'border-amber-200 bg-amber-50 text-amber-700',
  unverifiable: 'border-slate-200 bg-slate-50 text-slate-600'
})[status || 'unverifiable']

const canApproveSubmission = (submission: AdminPaymentSubmissionRow) =>
  submission.reconciliation_status === 'matched' || submission.reconciliation_status === 'overpaid'

const getApproveDisabledReason = (submission: AdminPaymentSubmissionRow) => {
  if (submission.reconciliation_status === 'underpaid') return '短繳付款不可核准，請退回使用者重新送出。'
  if (submission.reconciliation_status === 'unverifiable') return '系統無法可靠核對金額，只能退回。'
  return ''
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '尚無資料'

  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '尚無資料'
}

const formatPaymentInfo = (submission: AdminPaymentSubmissionRow) => {
  return [
    submission.payment_method || '尚未填寫',
    submission.account_last_5 ? `#${submission.account_last_5}` : null,
    submission.remittance_date || null
  ]
    .filter(Boolean)
    .join(' / ')
}

const highlightSubmissionFromRoute = async () => {
  const highlightSubmissionId = String(route.query.highlight_submission_id || '').trim()
  if (!highlightSubmissionId) {
    return
  }

  const hasPendingMatch = pendingSubmissions.value.some((submission) => submission.id === highlightSubmissionId)
  if (!hasPendingMatch) {
    return
  }

  isExpanded.value = true
  await nextTick()

  const target = document.getElementById(`profile-payment-submission-${highlightSubmissionId}`)
  if (!target) {
    return
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'bg-primary/5')
  window.setTimeout(() => {
    target.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'bg-primary/5')
  }, 2600)
}

const fetchSubmissions = async () => {
  isLoading.value = true

  try {
    submissions.value = await listProfilePaymentSubmissions()
    await highlightSubmissionFromRoute()
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入個人付款回報')
  } finally {
    isLoading.value = false
  }
}

const getOverpaymentAmount = (submission: AdminPaymentSubmissionRow) => {
  if (submission.items?.length) {
    return submission.items.reduce(
      (total, item) => total + Math.max(0, Number(item.amount_difference) || 0),
      0
    )
  }

  return Math.max(0, Number(submission.amount_difference) || 0)
}

const resolveOverpaymentAmount = async (submission: AdminPaymentSubmissionRow) => {
  const amount = getOverpaymentAmount(submission)
  if (amount <= 0) return 0

  await ElMessageBox.confirm(
    `系統核對為多繳 ${formatCurrency(amount)}。確認收款後，資料庫會自動把各球員的精確差額轉入其餘額。`,
    '確認多繳入帳',
    {
      type: 'warning',
      confirmButtonText: '確認收款並入帳',
      cancelButtonText: '取消'
    }
  )

  return amount
}

const updateSubmissionStatus = async (
  submission: AdminPaymentSubmissionRow,
  nextStatus: 'approved' | 'rejected',
  rejectionReason?: string | null
) => {
  const submissionId = submission.id
  processingIds.value.add(submissionId)

  try {
    if (nextStatus === 'approved' && !canApproveSubmission(submission)) {
      throw new Error(getApproveDisabledReason(submission))
    }

    const overpaymentAmount = nextStatus === 'approved'
      ? await resolveOverpaymentAmount(submission)
      : 0
    const updatedSubmission = await reviewMyPaymentSubmission(
      submissionId,
      nextStatus,
      overpaymentAmount,
      rejectionReason
    )

    submissions.value = submissions.value.map((submission) => {
      if (submission.id !== submissionId) {
        return submission
      }

      return {
        ...submission,
        ...(updatedSubmission || {}),
        status: nextStatus,
        updated_at: new Date().toISOString()
      }
    })

    if (nextStatus === 'rejected' && submission.profile_id) {
      try {
        await dispatchPushNotification({
          title: '付款回報已退回',
          body: `${rejectionReason || '付款資料需要修正'}；正確應付 ${formatNullableCurrency(submission.expected_external_amount)}。`,
          url: `/my-payments?highlight_submission_id=${submission.id}`,
          feature: 'fees',
          action: 'PAYMENT_REMINDER',
          eventKey: buildPushEventKey('profile_payment_submission_rejected', submission.id),
          targetUserIds: [submission.profile_id]
        })
      } catch (pushError) {
        console.warn('付款退回通知發送失敗', pushError)
        ElMessage.warning('付款回報已退回，但通知發送失敗，請另行通知使用者')
      }
    }

    ElMessage.success(nextStatus === 'approved' ? '已確認付款並同步正式收費紀錄' : '已退回這筆付款回報')
    return true
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '更新個人付款回報失敗')
    }
    return false
  } finally {
    processingIds.value.delete(submissionId)
    processingIds.value = new Set(processingIds.value)
  }
}

const openRejectDialog = (submission: AdminPaymentSubmissionRow) => {
  rejectingSubmission.value = submission
  rejectionPreset.value = submission.reconciliation_status === 'underpaid'
    ? '金額不足'
    : submission.reconciliation_status === 'overpaid'
      ? '金額超出'
      : ''
  rejectionDetail.value = ''
  isRejectDialogOpen.value = true
}

const closeRejectDialog = () => {
  isRejectDialogOpen.value = false
  rejectingSubmission.value = null
  rejectionPreset.value = ''
  rejectionDetail.value = ''
}

const submitRejection = async () => {
  const submission = rejectingSubmission.value
  if (!submission || !canSubmitRejection.value) return

  const rejectionReason = [rejectionPreset.value, rejectionDetail.value.trim()]
    .filter(Boolean)
    .join('：')
  if (await updateSubmissionStatus(submission, 'rejected', rejectionReason)) {
    closeRejectDialog()
  }
}

onMounted(() => {
  fetchSubmissions()
})

watch(
  () => route.query.highlight_submission_id,
  () => {
    void highlightSubmissionFromRoute()
  }
)
</script>
