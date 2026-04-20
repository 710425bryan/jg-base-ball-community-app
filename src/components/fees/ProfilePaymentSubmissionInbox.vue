<template>
  <section class="bg-amber-50/80 border border-amber-100 rounded-2xl p-4 md:p-5 shadow-sm">
    <div class="flex flex-col gap-4">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 class="text-lg font-black text-amber-900">個人回報 / 待確認</h3>
          <p class="text-xs md:text-sm text-amber-700/80 mt-1">
            這裡只顯示使用者從個人頁送出的付款回報；確認後仍需到下方月費或季費流程手動對應正式紀錄。
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
                  {{ getBillingModeLabel(submission.billing_mode) }}
                </span>
              </div>

              <div class="mt-3 grid gap-2 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">期別</div>
                  <div class="mt-1 font-bold text-slate-700">{{ submission.period_key }}</div>
                </div>
                <div>
                  <div class="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">金額</div>
                  <div class="mt-1 font-black text-primary">{{ formatCurrency(submission.amount) }}</div>
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
            </div>

            <div class="flex flex-row lg:flex-col gap-2 shrink-0">
              <button
                type="button"
                class="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 transition-colors disabled:opacity-70"
                :disabled="processingIds.has(submission.id)"
                @click="updateSubmissionStatus(submission.id, 'approved')"
              >
                確認收到
              </button>
              <button
                type="button"
                class="rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold px-4 py-2 transition-colors disabled:opacity-70"
                :disabled="processingIds.has(submission.id)"
                @click="updateSubmissionStatus(submission.id, 'rejected')"
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
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { useRoute } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import type { MyPaymentSubmissionStatus } from '@/types/payments'

type AdminPaymentSubmissionRow = {
  id: string
  member_id: string
  billing_mode: 'monthly' | 'quarterly'
  period_key: string
  amount: number
  payment_method: string
  account_last_5: string | null
  remittance_date: string | null
  note: string | null
  status: MyPaymentSubmissionStatus
  created_at: string
  updated_at: string
  team_members?: {
    name?: string | null
  } | null
  member_name: string
}

const DEFAULT_VISIBLE_COUNT = 4

const authStore = useAuthStore()
const route = useRoute()

const isLoading = ref(false)
const isExpanded = ref(false)
const processingIds = ref(new Set<string>())
const submissions = ref<AdminPaymentSubmissionRow[]>([])

const pendingSubmissions = computed(() => {
  return submissions.value.filter((submission) => submission.status === 'pending_review')
})

const visiblePendingSubmissions = computed(() => {
  if (isExpanded.value) {
    return pendingSubmissions.value
  }

  return pendingSubmissions.value.slice(0, DEFAULT_VISIBLE_COUNT)
})

const getBillingModeLabel = (billingMode: 'monthly' | 'quarterly') => {
  return billingMode === 'quarterly' ? '球員季繳' : '校隊月繳'
}

const formatCurrency = (amount: number) => {
  const normalizedAmount = Number(amount) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(normalizedAmount)
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
    const { data, error } = await supabase
      .from('profile_payment_submissions')
      .select(`
        id,
        member_id,
        billing_mode,
        period_key,
        amount,
        payment_method,
        account_last_5,
        remittance_date,
        note,
        status,
        created_at,
        updated_at,
        team_members(name)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    submissions.value = (data || []).map((submission: any) => ({
      ...submission,
      member_name: submission.team_members?.name || '未知成員'
    }))
    await highlightSubmissionFromRoute()
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入個人付款回報')
  } finally {
    isLoading.value = false
  }
}

const updateSubmissionStatus = async (submissionId: string, nextStatus: MyPaymentSubmissionStatus) => {
  processingIds.value.add(submissionId)

  try {
    const { error } = await supabase
      .from('profile_payment_submissions')
      .update({
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: authStore.user?.id || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', submissionId)

    if (error) {
      throw error
    }

    submissions.value = submissions.value.map((submission) => {
      if (submission.id !== submissionId) {
        return submission
      }

      return {
        ...submission,
        status: nextStatus,
        updated_at: new Date().toISOString()
      }
    })

    ElMessage.success(nextStatus === 'approved' ? '已標記為已確認，請記得同步正式收費紀錄' : '已退回這筆付款回報')
  } catch (error: any) {
    ElMessage.error(error?.message || '更新個人付款回報失敗')
  } finally {
    processingIds.value.delete(submissionId)
    processingIds.value = new Set(processingIds.value)
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
