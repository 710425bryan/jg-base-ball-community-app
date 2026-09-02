<script setup lang="ts">
import { computed } from 'vue'
import {
  getPaymentReconciliationLabel,
  reconcilePaymentAmounts
} from '@/utils/paymentReconciliation'

const props = withDefaults(defineProps<{
  memberName?: string | null
  expectedAmount: number
  balanceAmount: number
  reportedExternalAmount: number
  availableBalance: number
  disabled?: boolean
  formatCurrency?: (amount: number) => string
}>(), {
  memberName: '',
  disabled: false,
  formatCurrency: undefined
})

const emit = defineEmits<{
  (event: 'update:balanceAmount', value: number): void
  (event: 'update:reportedExternalAmount', value: number): void
}>()

const normalizeMoney = (value: unknown) =>
  Math.max(0, Math.trunc(Number(value) || 0))

const formatMoney = (value: number) =>
  props.formatCurrency
    ? props.formatCurrency(value)
    : new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value)

const normalizedAvailableBalance = computed(() => normalizeMoney(props.availableBalance))
const maxBalanceDeduction = computed(() =>
  Math.min(normalizeMoney(props.expectedAmount), normalizedAvailableBalance.value)
)
const balanceAmountModel = computed({
  get: () => Math.min(normalizeMoney(props.balanceAmount), maxBalanceDeduction.value),
  set: (value: number) => emit(
    'update:balanceAmount',
    Math.min(normalizeMoney(value), maxBalanceDeduction.value)
  )
})
const reportedExternalAmountModel = computed({
  get: () => normalizeMoney(props.reportedExternalAmount),
  set: (value: number) => emit('update:reportedExternalAmount', normalizeMoney(value))
})
const reconciliation = computed(() => reconcilePaymentAmounts(
  props.expectedAmount,
  balanceAmountModel.value,
  reportedExternalAmountModel.value
))
const statusLabel = computed(() => getPaymentReconciliationLabel(reconciliation.value.status))
const statusClass = computed(() => ({
  matched: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  underpaid: 'border-red-200 bg-red-50 text-red-700',
  overpaid: 'border-amber-200 bg-amber-50 text-amber-700',
  unverifiable: 'border-slate-200 bg-slate-50 text-slate-600'
})[reconciliation.value.status])
</script>

<template>
  <div class="grid gap-3">
    <div class="grid gap-2 sm:grid-cols-2">
      <div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
        <span class="text-[11px] font-black text-slate-400">系統應收</span>
        <div class="mt-1 font-mono text-base font-black text-slate-800">
          {{ formatMoney(normalizeMoney(expectedAmount)) }}
        </div>
      </div>

      <div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
        <span class="text-[11px] font-black text-slate-400">正確應付</span>
        <div class="mt-1 font-mono text-base font-black text-sky-700">
          {{ formatMoney(reconciliation.expectedExternalAmount || 0) }}
        </div>
      </div>
    </div>

    <div class="grid gap-2 sm:grid-cols-2">
      <div class="grid gap-1">
        <span class="text-[11px] font-black text-slate-400">
          餘額扣抵<span v-if="normalizedAvailableBalance > 0">（可用 {{ formatMoney(normalizedAvailableBalance) }}）</span>
        </span>
        <el-input-number
          v-model="balanceAmountModel"
          aria-label="餘額扣抵"
          class="!w-full"
          :min="0"
          :max="maxBalanceDeduction"
          :step="100"
          size="large"
          :disabled="disabled || normalizedAvailableBalance <= 0"
        />
      </div>

      <div class="grid gap-1">
        <span class="text-[11px] font-black text-slate-400">實際付款金額</span>
        <el-input-number
          v-model="reportedExternalAmountModel"
          aria-label="實際付款金額"
          class="!w-full"
          :min="0"
          :step="100"
          size="large"
          :disabled="disabled"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2" :class="statusClass">
      <span class="text-xs font-black">{{ statusLabel }}</span>
      <span class="font-mono text-sm font-black">
        差額 {{ reconciliation.amountDifference != null && reconciliation.amountDifference > 0 ? '+' : '' }}{{ formatMoney(reconciliation.amountDifference || 0) }}
      </span>
    </div>
  </div>
</template>
