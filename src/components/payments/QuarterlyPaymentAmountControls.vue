<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'

const props = withDefaults(defineProps<{
  memberName?: string | null
  amount: number
  balanceAmount: number
  availableBalance: number
  disabled?: boolean
  formatCurrency?: (amount: number) => string
}>(), {
  memberName: '',
  disabled: false,
  formatCurrency: undefined
})

const emit = defineEmits<{
  (event: 'update:amount', value: number): void
  (event: 'update:balanceAmount', value: number): void
}>()

const hasShownBalanceReminder = ref(false)

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
  Math.min(normalizeMoney(props.amount), normalizedAvailableBalance.value)
)
const amountModel = computed({
  get: () => normalizeMoney(props.amount),
  set: (value: number) => emit('update:amount', normalizeMoney(value))
})
const balanceAmountModel = computed({
  get: () => Math.min(normalizeMoney(props.balanceAmount), maxBalanceDeduction.value),
  set: (value: number) => emit(
    'update:balanceAmount',
    Math.min(normalizeMoney(value), maxBalanceDeduction.value)
  )
})

const handleManualAmountChange = (value: number | undefined) => {
  if (
    hasShownBalanceReminder.value
    || props.disabled
    || normalizeMoney(value) <= 0
    || normalizedAvailableBalance.value <= 0
  ) {
    return
  }

  hasShownBalanceReminder.value = true
  const memberLabel = props.memberName ? `${props.memberName}目前` : '目前'

  void ElMessageBox.alert(
    `${memberLabel}有可用餘額 ${formatMoney(normalizedAvailableBalance.value)}，請使用下方「餘額扣抵」功能。`,
    '提醒使用可用餘額',
    {
      type: 'warning',
      confirmButtonText: '我知道了',
      customClass: 'balance-deduction-reminder-dialog'
    }
  ).catch(() => undefined)
}
</script>

<template>
  <div
    class="grid gap-2"
    :class="normalizedAvailableBalance > 0 ? 'sm:grid-cols-2' : ''"
  >
    <div class="grid gap-1">
      <span class="text-[11px] font-black text-slate-400">季費金額</span>
      <el-input-number
        v-model="amountModel"
        aria-label="季費金額"
        class="!w-full"
        :min="0"
        :step="100"
        size="large"
        :disabled="disabled"
        @change="handleManualAmountChange"
      />
    </div>

    <div v-if="normalizedAvailableBalance > 0" class="grid gap-1">
      <span class="text-[11px] font-black text-slate-400">餘額扣抵</span>
      <el-input-number
        v-model="balanceAmountModel"
        aria-label="餘額扣抵"
        class="!w-full"
        :min="0"
        :max="maxBalanceDeduction"
        :step="100"
        size="large"
        :disabled="disabled"
      />
    </div>
  </div>
</template>
