<script setup lang="ts">
import { computed, useId } from 'vue'
import {
  FIXED_MONTHLY_FEE_BILLING_MODE,
  MONTHLY_PER_SESSION_FEE_BILLING_MODE,
  NO_FEE_BILLING_MODE,
  ROLE_DEFAULT_FEE_BILLING_MODE
} from '@/utils/memberBilling'

const props = defineProps<{
  role: string
  feeBillingMode: string
  matchFeeEnabled: boolean
  matchFeeStartDate?: string | null
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:feeBillingMode': [value: string]
  'update:matchFeeEnabled': [value: boolean]
}>()
const hintId = `player-match-fee-hint-${useId()}`
const options = computed(() => [
  { label: props.role === '校隊' ? '校隊月繳' : '球員季繳', value: ROLE_DEFAULT_FEE_BILLING_MODE },
  ...(props.role === '球員' ? [
    { label: '計次月費', value: MONTHLY_PER_SESSION_FEE_BILLING_MODE },
    { label: '固定月繳', value: FIXED_MONTHLY_FEE_BILLING_MODE }
  ] : []),
  { label: '不收隊費', value: NO_FEE_BILLING_MODE }
])
</script>

<template>
  <div v-if="role === '球員' || role === '校隊'" class="player-billing-fields sm:col-span-2 min-w-0">
    <el-form-item label="隊費收費模式" prop="fee_billing_mode" class="font-bold">
      <el-radio-group
        :model-value="feeBillingMode"
        :disabled="disabled"
        aria-label="隊費收費模式"
        class="billing-mode-radio-group"
        @update:model-value="emit('update:feeBillingMode', String($event))"
      >
        <el-radio-button v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item label="比賽費" prop="match_fee_enabled" class="font-bold !mb-0">
      <div class="min-w-0 w-full" role="group" aria-label="比賽費設定" :aria-describedby="hintId">
        <el-switch
          :model-value="matchFeeEnabled"
          :disabled="disabled"
          aria-label="依參賽收取比賽費"
          active-text="依參賽收費"
          inactive-text="免收"
          class="match-fee-switch"
          @update:model-value="emit('update:matchFeeEnabled', $event === true)"
        />
        <p :id="hintId" class="mt-1 text-sm font-normal leading-relaxed text-slate-500">
          比賽費獨立於隊費。開啟或重新開啟後，從儲存當天（台灣日期）起的比賽依參賽與請假狀態收費，過去日期不補收；單場免繳仍有效。待確認與已付款紀錄保留，裝備加購另計。
        </p>
        <p v-if="matchFeeEnabled && matchFeeStartDate" class="mt-1 text-sm font-normal text-slate-600">
          目前生效日期：{{ matchFeeStartDate }}
        </p>
      </div>
    </el-form-item>
  </div>
</template>

<style scoped>
.player-billing-fields {
  --el-color-primary: var(--color-primary, #D88F22);
}
.billing-mode-radio-group {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
}
.billing-mode-radio-group :deep(.el-radio-button) { min-width: 0; }
.billing-mode-radio-group :deep(.el-radio-button__inner) {
  display: flex;
  width: 100%;
  min-height: 44px;
  padding: 8px;
  align-items: center;
  justify-content: center;
  border-left: var(--el-border);
  border-radius: 8px !important;
  line-height: 1.5;
  white-space: normal;
}
.match-fee-switch { min-height: 44px; }
.match-fee-switch :deep(.el-switch__core) { min-width: 44px; min-height: 24px; }
@media (min-width: 768px) {
  .billing-mode-radio-group { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
</style>
