<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEquipmentPaymentsStore } from '@/stores/equipmentPayments'
import type { EquipmentPaymentSubmission } from '@/types/equipment'
import {
  getEquipmentAdminStatusPresentation,
  type EquipmentPaymentAdminRecord
} from '@/utils/equipmentPurchaseAdmin'
import { formatEquipmentVariantLabel } from '@/utils/equipmentPricing'
import {
  EQUIPMENT_REQUEST_STATUS,
  getEquipmentFulfillmentStatusLabel
} from '@/utils/equipmentRequestStatus'
import { buildPaymentBreakdownText } from '@/utils/playerBalance'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'
import AppActionOverflow from '@/components/common/AppActionOverflow.vue'

const props = defineProps<{
  record: EquipmentPaymentAdminRecord
  canEdit: boolean
}>()

const emit = defineEmits<{
  changed: [recordKey: string]
}>()

const paymentsStore = useEquipmentPaymentsStore()
const isProcessing = ref(false)

const submission = computed(() => (
  props.record.recordType === 'payment_submission' ? props.record.source : null
))
const transaction = computed(() => (
  props.record.recordType === 'transaction' ? props.record.source : null
))
const detailItems = computed(() => submission.value?.items || (transaction.value ? [transaction.value] : []))
const statusPresentation = computed(() => (
  getEquipmentAdminStatusPresentation('payments', props.record.status)
))

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

const getVariantLabel = (item: { size?: string | null; jersey_number?: number | string | null }) => (
  formatEquipmentVariantLabel(item, '')
)

const getFulfillmentStatusClass = (status?: string | null) => {
  if (status === EQUIPMENT_REQUEST_STATUS.PICKED_UP) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP) return 'border-sky-200 bg-sky-50 text-sky-700'
  if (status === EQUIPMENT_REQUEST_STATUS.APPROVED) return 'border-orange-200 bg-orange-50 text-orange-700'
  return 'border-slate-200 bg-slate-50 text-slate-600'
}

const notifySubmitter = async (
  target: EquipmentPaymentSubmission,
  status: 'approved' | 'rejected' | 'refunded'
) => {
  try {
    await dispatchPushNotification({
      title: status === 'approved'
        ? '裝備付款已收款完成'
        : status === 'refunded'
          ? '裝備付款已退款'
          : '裝備付款已退回',
      body: status === 'approved'
        ? `${target.member_name} 的裝備付款已收款完成。`
        : status === 'refunded'
          ? `${target.member_name} 的裝備付款已退款，請至繳費資訊查看。`
          : `${target.member_name} 的裝備付款回報已退回，請至繳費資訊查看。`,
      url: `/my-payments?view=equipment&highlight_equipment_submission_id=${target.id}`,
      feature: 'equipment',
      action: 'VIEW',
      targetUserIds: [target.profile_id],
      eventKey: buildPushEventKey(`equipment-payment-${status}`, target.id)
    })
  } catch (error) {
    console.warn('Equipment payment review push failed', error)
  }
}

const completeAction = () => emit('changed', props.record.key)

const markPaid = async () => {
  const item = transaction.value
  if (!item) return

  try {
    await ElMessageBox.confirm(
      `確認 ${item.member_name} 的 ${item.equipment_name} 已收款 ${formatCurrency(item.total_amount)}？`,
      '標記裝備已收款',
      { confirmButtonText: '標記已收款', cancelButtonText: '取消', type: 'warning' }
    )
    isProcessing.value = true
    await paymentsStore.markPaid([item.transaction_id])
    ElMessage.success('已標記裝備款項為已收款')
    completeAction()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '標記裝備付款失敗')
    }
  } finally {
    isProcessing.value = false
  }
}

const resolveOverpaymentAmount = async () => {
  const { value } = await ElMessageBox.prompt(
    '若這筆裝備付款有多收並要轉入球員餘額，請輸入金額；沒有則填 0。',
    '確認裝備收款',
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

const review = async (status: 'approved' | 'rejected') => {
  const target = submission.value
  if (!target) return

  isProcessing.value = true
  try {
    const overpaymentAmount = status === 'approved' ? await resolveOverpaymentAmount() : 0
    const updated = await paymentsStore.reviewSubmission(target.id, status, overpaymentAmount)
    ElMessage.success(status === 'approved' ? '已確認裝備收款' : '已退回裝備付款')
    await notifySubmitter(updated, status)
    completeAction()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '更新裝備付款回報失敗')
    }
  } finally {
    isProcessing.value = false
  }
}

const refundSubmission = async () => {
  const target = submission.value
  if (!target) return

  try {
    const { value } = await ElMessageBox.prompt(
      '退款會同步處理付款單、裝備交易與相關球員餘額流水。請輸入退款／作廢原因（可留空）。',
      '退款／作廢收款',
      {
        confirmButtonText: '確認退款',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPlaceholder: '例如：測試請購作廢、家長取消加購'
      }
    )
    isProcessing.value = true
    const updated = await paymentsStore.refundSubmission(target.id, String(value || '').trim() || null)
    ElMessage.success('已標記裝備付款為已退款')
    await notifySubmitter(updated, 'refunded')
    completeAction()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '退款／作廢收款失敗')
    }
  } finally {
    isProcessing.value = false
  }
}

const refundDirectPayment = async () => {
  const item = transaction.value
  if (!item) return

  try {
    const { value } = await ElMessageBox.prompt(
      `這會將 ${item.member_name} 的 ${item.equipment_name} ${formatCurrency(item.total_amount)} 改為已退款。請輸入作廢原因（可留空）。`,
      '作廢直接收款',
      {
        confirmButtonText: '確認作廢',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPlaceholder: '例如：測試請購作廢、誤按標記已收款'
      }
    )
    isProcessing.value = true
    await paymentsStore.refundDirectTransactions([item.transaction_id], String(value || '').trim() || null)
    ElMessage.success('已作廢這筆裝備收款')
    completeAction()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '作廢裝備收款失敗')
    }
  } finally {
    isProcessing.value = false
  }
}

const handleOverflow = (command: unknown) => {
  if (command === 'reject') void review('rejected')
}
</script>

<template>
  <article class="flex min-h-full flex-col bg-white">
    <div class="flex-1 space-y-5 p-4 lg:p-6">
      <header class="border-b border-slate-100 pb-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-black" :class="statusPresentation.titleClass">{{ record.statusLabel }}</p>
            <h2 class="mt-1 text-xl font-black text-slate-800">{{ record.memberName }}</h2>
            <p class="mt-1 text-sm font-bold text-slate-500">{{ record.equipmentSummary }}</p>
          </div>
          <div class="text-right">
            <p class="text-xs font-bold text-slate-400">應處理金額</p>
            <p class="mt-1 tabular-nums text-2xl font-black text-primary">{{ formatCurrency(record.amount) }}</p>
          </div>
        </div>
      </header>

      <section v-if="submission" class="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
        <div>
          <p class="text-xs font-bold text-slate-400">付款拆解</p>
          <p class="mt-1 text-sm font-black text-slate-700">
            {{ buildPaymentBreakdownText(submission.amount, submission.balance_amount, formatCurrency) }}
          </p>
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400">外部付款</p>
          <p class="mt-1 tabular-nums text-sm font-black text-slate-700">{{ formatCurrency(submission.external_amount) }}</p>
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400">匯款資訊</p>
          <p class="mt-1 text-sm font-black text-slate-700">
            {{ submission.payment_method }}<span v-if="submission.account_last_5">／#{{ submission.account_last_5 }}</span>
          </p>
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400">回報／確認時間</p>
          <p class="mt-1 text-sm font-black text-slate-700">
            {{ formatDateTime(record.status === 'refundable' ? submission.reviewed_at : submission.created_at) }}
          </p>
        </div>
      </section>

      <section v-else-if="transaction" class="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
        <div>
          <p class="text-xs font-bold text-slate-400">交易日期</p>
          <p class="mt-1 text-sm font-black text-slate-700">{{ formatDate(transaction.picked_up_at || transaction.transaction_date) }}</p>
        </div>
        <div>
          <p class="text-xs font-bold text-slate-400">單價／數量</p>
          <p class="mt-1 text-sm font-black text-slate-700">{{ formatCurrency(transaction.unit_price) }} × {{ transaction.quantity }}</p>
        </div>
      </section>

      <section>
        <h3 class="text-sm font-black text-slate-800">裝備品項</h3>
        <div class="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          <div v-for="item in detailItems" :key="item.transaction_id" class="p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-black text-slate-700">{{ item.equipment_name }}</p>
                <p v-if="getVariantLabel(item)" class="mt-1 text-xs font-bold text-slate-400">{{ getVariantLabel(item) }}</p>
                <span
                  v-if="item.request_status"
                  :class="getFulfillmentStatusClass(item.request_status)"
                  class="mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-bold"
                >
                  {{ getEquipmentFulfillmentStatusLabel(item.request_status) }}
                </span>
              </div>
              <div class="shrink-0 text-right">
                <p class="font-black text-primary">{{ formatCurrency(item.total_amount) }}</p>
                <p class="mt-1 text-xs font-bold text-slate-400">{{ item.quantity }} 件</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <p v-if="submission?.note" class="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
        {{ submission.note }}
      </p>
    </div>

    <footer
      v-if="canEdit"
      class="sticky bottom-0 z-10 flex min-h-[4.75rem] items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:px-6"
    >
      <template v-if="record.status === 'review'">
        <AppActionOverflow :disabled="isProcessing" @command="handleOverflow">
          <el-dropdown-item command="reject">退回付款回報</el-dropdown-item>
        </AppActionOverflow>
        <button
          type="button"
          class="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-black text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:opacity-50"
          :disabled="isProcessing"
          @click="review('approved')"
        >確認收到</button>
      </template>
      <button
        v-else-if="record.status === 'unpaid'"
        type="button"
        class="min-h-11 rounded-xl bg-sky-700 px-5 text-sm font-black text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50"
        :disabled="isProcessing"
        @click="markPaid"
      >標記已收款</button>
      <button
        v-else-if="record.recordType === 'payment_submission'"
        type="button"
        class="min-h-11 rounded-xl border border-orange-200 bg-orange-50 px-5 text-sm font-black text-orange-700 transition-colors hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 disabled:opacity-50"
        :disabled="isProcessing"
        @click="refundSubmission"
      >退款／作廢收款</button>
      <button
        v-else
        type="button"
        class="min-h-11 rounded-xl border border-orange-200 bg-orange-50 px-5 text-sm font-black text-orange-700 transition-colors hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200 disabled:opacity-50"
        :disabled="isProcessing"
        @click="refundDirectPayment"
      >作廢直接收款</button>
    </footer>
  </article>
</template>
