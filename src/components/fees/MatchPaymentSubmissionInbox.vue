<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, Refresh } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import { listMatchPaymentSubmissions, reviewMatchPaymentSubmission } from '@/services/matchFees'
import type { MatchPaymentSubmission, ReviewMatchPaymentSubmissionStatus } from '@/types/matchFees'
import { buildPaymentBreakdownText } from '@/utils/playerBalance'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

const route = useRoute()
const emit = defineEmits<{
  (event: 'reviewed', submission: MatchPaymentSubmission): void
}>()
const isLoading = ref(false)
const submissions = ref<MatchPaymentSubmission[]>([])
const processingIds = ref(new Set<string>())

const pendingSubmissions = computed(() =>
  submissions.value.filter((submission) => submission.status === 'pending_review')
)

const visibleSubmissions = computed(() => pendingSubmissions.value.slice(0, 8))

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const formatDate = (value?: string | null) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '尚無資料'
}

const formatDateTime = (value?: string | null) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '尚無資料'
}

const paymentInfo = (submission: MatchPaymentSubmission) => [
  submission.payment_method,
  submission.account_last_5 ? `#${submission.account_last_5}` : null,
  formatDate(submission.remittance_date)
].filter(Boolean).join(' / ')

const formatBreakdown = (submission: MatchPaymentSubmission) =>
  buildPaymentBreakdownText(submission.amount, submission.balance_amount, formatCurrency)

const setProcessing = (id: string, value: boolean) => {
  const next = new Set(processingIds.value)
  if (value) next.add(id)
  else next.delete(id)
  processingIds.value = next
}

const notifySubmitter = async (
  submission: MatchPaymentSubmission,
  status: ReviewMatchPaymentSubmissionStatus
) => {
  try {
    await dispatchPushNotification({
      title: status === 'approved' ? '比賽費用付款已確認' : '比賽費用付款已退回',
      body: status === 'approved'
        ? `${submission.member_name} 的比賽費用付款已確認。`
        : `${submission.member_name} 的比賽費用付款回報已退回，請至繳費資訊查看。`,
      url: `/my-payments?highlight_match_submission_id=${submission.id}`,
      feature: 'fees',
      action: 'VIEW',
      targetUserIds: [submission.profile_id],
      eventKey: buildPushEventKey(`match-fee-payment-${status}`, submission.id)
    })
  } catch (error) {
    console.warn('Match fee payment review push failed', error)
  }
}

const resolveOverpaymentAmount = async (status: ReviewMatchPaymentSubmissionStatus) => {
  if (status !== 'approved') return 0

  const { value } = await ElMessageBox.prompt(
    '若這筆比賽費用有多收並要轉入球員餘額，請輸入金額；沒有則填 0。',
    '確認比賽費用付款',
    {
      confirmButtonText: '確認',
      cancelButtonText: '取消',
      inputValue: '0',
      inputPattern: /^[0-9]+$/,
      inputErrorMessage: '請輸入 0 或正整數'
    }
  )

  return Math.max(0, Number(value) || 0)
}

const review = async (
  submission: MatchPaymentSubmission,
  status: ReviewMatchPaymentSubmissionStatus
) => {
  setProcessing(submission.id, true)
  try {
    const overpaymentAmount = await resolveOverpaymentAmount(status)
    const updated = await reviewMatchPaymentSubmission(submission.id, status, overpaymentAmount)
    submissions.value = submissions.value.map((item) => item.id === updated.id ? updated : item)
    ElMessage.success(status === 'approved' ? '已確認比賽費用付款' : '已退回比賽費用付款')
    emit('reviewed', updated)
    await notifySubmitter(updated, status)
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '更新比賽費用付款回報失敗')
    }
  } finally {
    setProcessing(submission.id, false)
  }
}

const highlightFromRoute = async () => {
  const id = String(route.query.highlight_match_submission_id || '').trim()
  if (!id) return

  await nextTick()
  const target = document.getElementById(`match-payment-submission-${id}`)
  if (!target) return

  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
  window.setTimeout(() => target.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2600)
}

const refresh = async () => {
  isLoading.value = true
  try {
    submissions.value = await listMatchPaymentSubmissions()
    await highlightFromRoute()
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取比賽費用付款回報失敗')
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void refresh()
})

watch(() => route.query.highlight_match_submission_id, () => {
  void highlightFromRoute()
})
</script>

<template>
  <section class="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 md:p-5 shadow-sm">
    <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h3 class="text-lg font-black text-amber-900">比賽費用付款 / 待確認</h3>
        <p class="mt-1 text-xs md:text-sm text-amber-700/80">
          家長在繳費資訊送出的比賽費用付款回報，確認後會把對應場次費用標記為已付款。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="rounded-full bg-white/80 border border-amber-200 px-3 py-1 text-xs font-black text-amber-700">
          待確認 {{ pendingSubmissions.length }} 筆
        </span>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white/80 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-white transition-colors disabled:opacity-70"
          :disabled="isLoading"
          @click="refresh"
        >
          <el-icon :class="{ 'is-loading': isLoading }"><Refresh /></el-icon>
          重新整理
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="mt-4 flex items-center gap-3 text-sm font-bold text-amber-700/70">
      <el-icon class="is-loading text-amber-600"><Loading /></el-icon>
      讀取比賽費用付款回報中...
    </div>

    <div v-else-if="pendingSubmissions.length === 0" class="mt-4 rounded-2xl bg-white/70 border border-white px-4 py-5 text-sm text-amber-700/70 font-bold">
      目前沒有待確認的比賽費用付款回報。
    </div>

    <div v-else class="mt-4 grid gap-3">
      <article
        v-for="submission in visibleSubmissions"
        :id="`match-payment-submission-${submission.id}`"
        :key="submission.id"
        class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm transition-all"
      >
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <div class="text-base md:text-lg font-black text-slate-800">{{ submission.member_name }}</div>
              <span class="rounded-full bg-amber-50 border border-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                比賽費用
              </span>
            </div>

            <div class="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">金額</div>
                <div class="mt-1 font-black text-primary">{{ formatCurrency(submission.amount) }}</div>
                <div class="mt-0.5 text-xs font-bold text-gray-400">{{ formatBreakdown(submission) }}</div>
              </div>
              <div>
                <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">匯款資訊</div>
                <div class="mt-1 font-bold text-slate-700">{{ paymentInfo(submission) }}</div>
              </div>
              <div>
                <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">送出時間</div>
                <div class="mt-1 font-medium text-slate-700">{{ formatDateTime(submission.created_at) }}</div>
              </div>
              <div>
                <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">場次</div>
                <div class="mt-1 font-black text-slate-700">{{ submission.items.length }} 筆</div>
              </div>
            </div>

            <div class="mt-3 grid gap-1 text-sm text-gray-500">
              <div v-for="item in submission.items" :key="item.id" class="flex items-center justify-between gap-3">
                <span>{{ item.match_name }} <span class="text-gray-400">{{ formatDate(item.match_date) }}</span></span>
                <span class="font-bold text-primary">{{ formatCurrency(item.amount) }}</span>
              </div>
            </div>

            <p v-if="submission.note" class="mt-3 text-sm text-gray-500 leading-relaxed border-t border-gray-100 pt-3">
              {{ submission.note }}
            </p>
          </div>

          <div class="flex flex-row lg:flex-col gap-2 shrink-0">
            <button
              type="button"
              class="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 transition-colors disabled:opacity-70"
              :disabled="processingIds.has(submission.id)"
              @click="review(submission, 'approved')"
            >
              確認收到
            </button>
            <button
              type="button"
              class="rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-2 transition-colors disabled:opacity-70"
              :disabled="processingIds.has(submission.id)"
              @click="review(submission, 'rejected')"
            >
              退回
            </button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>
