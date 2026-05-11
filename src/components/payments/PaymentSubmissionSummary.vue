<script setup lang="ts">
import { computed } from 'vue'

type PaymentSubmissionLineItem = {
  id: string
  typeLabel: string
  title?: string | null
  meta?: string | null
  periodLabel?: string | null
  amount: number
}

const props = withDefaults(defineProps<{
  memberName?: string | null
  totalAmount: number
  availableBalance: number
  balanceAmount: number
  externalAmount?: number | null
  lineItems?: PaymentSubmissionLineItem[]
  lineItemsCount?: number | null
  lineItemsTitle?: string
  emptyItemsText?: string
  hideBalanceControl?: boolean
  disabled?: boolean
  formatCurrency?: (amount: number) => string
}>(), {
  memberName: '',
  externalAmount: null,
  lineItems: () => [],
  lineItemsCount: null,
  lineItemsTitle: '繳費項目清單',
  emptyItemsText: '目前尚未選擇繳費項目。',
  hideBalanceControl: false,
  disabled: false,
  formatCurrency: undefined
})

const emit = defineEmits<{
  (event: 'update:balanceAmount', value: number): void
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

const normalizedTotalAmount = computed(() => normalizeMoney(props.totalAmount))
const normalizedAvailableBalance = computed(() => normalizeMoney(props.availableBalance))
const maxDeductionAmount = computed(() =>
  Math.min(normalizedTotalAmount.value, normalizedAvailableBalance.value)
)
const normalizedBalanceAmount = computed(() =>
  Math.min(normalizeMoney(props.balanceAmount), maxDeductionAmount.value)
)
const normalizedExternalAmount = computed(() => {
  if (props.externalAmount != null) {
    return normalizeMoney(props.externalAmount)
  }

  return Math.max(0, normalizedTotalAmount.value - normalizedBalanceAmount.value)
})
const remainingBalanceAmount = computed(() =>
  Math.max(0, normalizedAvailableBalance.value - normalizedBalanceAmount.value)
)
const canUseDeduction = computed(() =>
  !props.disabled && maxDeductionAmount.value > 0
)
const isDeductionEnabled = computed({
  get: () => normalizedBalanceAmount.value > 0,
  set: (enabled: boolean) => {
    emit('update:balanceAmount', enabled ? maxDeductionAmount.value : 0)
  }
})
const balanceOwnerLabel = computed(() =>
  props.memberName ? `${props.memberName} 的可用餘額` : '可用餘額'
)
const deductionHelperText = computed(() => {
  if (normalizedAvailableBalance.value <= 0) {
    return '目前沒有可用餘額，會以本次實付金額全額送出。'
  }

  if (maxDeductionAmount.value <= 0) {
    return '選擇繳費項目後，才可使用餘額扣抵。'
  }

  return `最多可扣抵 ${formatMoney(maxDeductionAmount.value)}，送出待確認後由管理員確認扣款。`
})
const paymentHintText = computed(() => {
  if (normalizedExternalAmount.value <= 0) {
    return '本次可全額使用餘額扣抵，送出後等待管理員確認。'
  }

  return `本次至少需實付 ${formatMoney(normalizedExternalAmount.value)}；若有溢繳，管理員確認時可轉入球員餘額。`
})
const displayedLineItemsCount = computed(() =>
  props.lineItemsCount ?? props.lineItems.length
)
</script>

<template>
  <div class="space-y-5">
    <section v-if="!hideBalanceControl" class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 md:p-5">
      <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem] md:items-center">
        <div class="min-w-0">
          <h4 class="text-base font-black text-emerald-800">{{ balanceOwnerLabel }}</h4>
          <p class="mt-1 text-sm font-bold leading-relaxed text-slate-500">
            {{ deductionHelperText }}
          </p>
        </div>

        <div class="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
          <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div class="min-w-0">
              <div class="text-xs font-bold text-slate-500">目前可用</div>
              <div class="mt-1 font-mono text-xl font-black text-emerald-700">
                {{ formatMoney(normalizedAvailableBalance) }}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <el-switch
                v-model="isDeductionEnabled"
                :disabled="!canUseDeduction"
                size="large"
              />
              <span
                class="text-sm font-black"
                :class="canUseDeduction ? 'text-sky-600' : 'text-slate-300'"
              >
                使用扣抵
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="mb-3 flex items-center justify-between gap-3">
        <h4 class="text-sm font-black text-slate-700">{{ lineItemsTitle }}</h4>
        <span class="text-xs font-bold text-slate-400">{{ displayedLineItemsCount }} 筆</span>
      </div>

      <slot name="items">
        <div v-if="lineItems.length > 0" class="space-y-3">
          <article
            v-for="item in lineItems"
            :key="item.id"
            class="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:grid-cols-[8rem_minmax(0,1fr)_8rem] sm:items-center"
          >
            <div class="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-600">
              {{ item.typeLabel }}
            </div>
            <div class="min-w-0">
              <div class="font-black text-slate-800">{{ item.title || item.periodLabel || item.typeLabel }}</div>
              <p v-if="item.meta || item.periodLabel" class="mt-1 text-xs font-bold text-slate-400">
                {{ [item.periodLabel, item.meta].filter(Boolean).join('｜') }}
              </p>
            </div>
            <div class="font-mono text-lg font-black text-slate-800 sm:text-right">
              {{ formatMoney(normalizeMoney(item.amount)) }}
            </div>
          </article>
        </div>

        <div v-else class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm font-bold text-slate-400">
          {{ emptyItemsText }}
        </div>
      </slot>
    </section>

    <section class="rounded-2xl bg-slate-900 px-5 py-4 text-white shadow-sm">
      <div class="flex items-center justify-between gap-4">
        <div class="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Total Amount</div>
        <div class="font-mono text-3xl font-black tracking-normal">{{ formatMoney(normalizedTotalAmount) }}</div>
      </div>
    </section>

    <section class="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 md:p-5">
      <div class="grid gap-4 sm:grid-cols-3">
        <div>
          <div class="text-sm font-black text-slate-500">應繳總額</div>
          <div class="mt-1 font-mono text-lg font-black text-slate-800">{{ formatMoney(normalizedTotalAmount) }}</div>
        </div>
        <div>
          <div class="text-sm font-black text-slate-500">可用餘額</div>
          <div class="mt-1 font-mono text-lg font-black text-emerald-700">{{ formatMoney(normalizedAvailableBalance) }}</div>
        </div>
        <div>
          <div class="text-sm font-black text-slate-500">本次扣抵</div>
          <div class="mt-1 font-mono text-lg font-black text-emerald-700">{{ formatMoney(normalizedBalanceAmount) }}</div>
        </div>
        <div>
          <div class="text-sm font-black text-slate-500">本次實付</div>
          <div class="mt-1 font-mono text-lg font-black text-slate-800">{{ formatMoney(normalizedExternalAmount) }}</div>
        </div>
        <div>
          <div class="text-sm font-black text-slate-500">溢繳存入</div>
          <div class="mt-1 font-mono text-lg font-black text-slate-500">{{ formatMoney(0) }}</div>
        </div>
        <div>
          <div class="text-sm font-black text-slate-500">送出後餘額</div>
          <div class="mt-1 font-mono text-lg font-black text-emerald-700">{{ formatMoney(remainingBalanceAmount) }}</div>
        </div>
      </div>

      <p class="mt-4 text-sm font-bold leading-relaxed text-slate-500">
        {{ paymentHintText }}
      </p>
    </section>
  </div>
</template>
