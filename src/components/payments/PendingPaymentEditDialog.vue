<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import { isPendingPaymentConflict, pendingPaymentErrorMessage, updateMyPendingPaymentSubmission } from '@/services/pendingPayments'
import type { PendingPaymentChanges, PendingPaymentSubmission } from '@/types/pendingPayments'
import { BALANCE_PAYMENT_METHOD, PAYMENT_METHOD_OPTIONS, normalizeAccountLast5 } from '@/utils/paymentMethods'

const props = defineProps<{ submission: PendingPaymentSubmission | null }>()
const emit = defineEmits<{ close: []; saved: []; conflict: [] }>()
const saving = ref(false)
const attempted = ref(false)
const serverError = ref('')
const form = reactive<PendingPaymentChanges>({ payment_method: '', account_last_5: '', remittance_date: '', note: '', amount_mismatch_reason: '', items: [] })
const money = (amount: number) => `$${amount.toLocaleString('en-US')}`

watch(() => props.submission, (submission) => {
  attempted.value = false
  serverError.value = ''
  if (!submission) return
  Object.assign(form, {
    payment_method: submission.payment_method,
    account_last_5: submission.account_last_5,
    remittance_date: submission.remittance_date,
    note: submission.note,
    amount_mismatch_reason: submission.amount_mismatch_reason,
    items: submission.items.map(({ id, balance_amount, reported_external_amount }) => ({ id, balance_amount, reported_external_amount }))
  })
}, { immediate: true })

const totalReported = computed(() => form.items.reduce((sum, item) => sum + (Number(item.reported_external_amount) || 0), 0))
const mismatch = computed(() => props.submission?.kind === 'membership' && form.items.some((item, index) => {
  const expected = props.submission?.items[index]?.expected_amount
  return expected != null && item.reported_external_amount !== expected - item.balance_amount
}))
const needsAccount = computed(() => totalReported.value > 0 && form.payment_method !== '現金')
const methodOptions = computed(() => Array.from(new Set<string>([
  ...PAYMENT_METHOD_OPTIONS,
  ...(['郵局無摺', '匯款', '匯款轉帳', 'ATM轉帳'].includes(form.payment_method) ? [form.payment_method] : [])
])))
const lineErrors = computed(() => form.items.map((item, index) => {
  const original = props.submission?.items[index]
  if (!original || original.expected_amount == null) return ''
  if (![item.balance_amount, item.reported_external_amount].every((value) => Number.isInteger(value) && value >= 0)) return '請輸入非負整數金額。'
  if (item.balance_amount > original.expected_amount) return '餘額扣抵不可超過系統應收。'
  const memberBalance = form.items.reduce((sum, line, lineIndex) =>
    props.submission?.items[lineIndex]?.member_id === original.member_id ? sum + line.balance_amount : sum, 0)
  if (memberBalance > Math.max(0, original.available_balance)) return '球員可用餘額不足，請減少扣抵金額。'
  return ''
}))
const errors = computed(() => ({
  method: totalReported.value > 0 && !methodOptions.value.includes(form.payment_method) ? '請選擇付款方式。' : '',
  account: needsAccount.value && !/^\d{5}$/.test(form.account_last_5 || '') ? '請輸入匯款帳號後五碼。' : '',
  date: !/^\d{4}-\d{2}-\d{2}$/.test(form.remittance_date || '') ? '請選擇匯款日期。' : '',
  reason: mismatch.value && !form.amount_mismatch_reason?.trim() ? '實付金額不同時，請填寫金額異常原因。' : ''
}))

const changeBalance = (index: number, value: number | undefined) => {
  const item = form.items[index]
  const original = props.submission?.items[index]
  if (!item || original?.expected_amount == null) return
  const matchedBefore = item.reported_external_amount === original.expected_amount - item.balance_amount
  item.balance_amount = value ?? 0
  if (props.submission?.kind !== 'membership' || matchedBefore) {
    item.reported_external_amount = Math.max(0, original.expected_amount - item.balance_amount)
  }
}
const close = () => { if (!saving.value) emit('close') }
const save = async () => {
  if (!props.submission || saving.value) return
  attempted.value = true
  serverError.value = ''
  if (Object.values(errors.value).some(Boolean) || lineErrors.value.some(Boolean)) return
  const submission = props.submission
  const payload: PendingPaymentChanges = {
    ...form,
    payment_method: totalReported.value === 0 ? BALANCE_PAYMENT_METHOD : form.payment_method,
    account_last_5: needsAccount.value ? form.account_last_5 : null,
    items: form.items.map((item) => ({ ...item }))
  }
  saving.value = true
  try {
    if (mismatch.value) {
      try {
        await ElMessageBox.confirm('實際付款與系統應付不同，管理員將依金額及異常原因核對。確定儲存修改？', '確認付款差額', {
          confirmButtonText: '儲存修改', cancelButtonText: '返回修改', type: 'warning'
        })
      } catch { return }
    }
    await updateMyPendingPaymentSubmission(submission, payload)
    ElMessage.success('付款回報已更新，等待管理員確認。')
    emit('saved')
  } catch (error) {
    if (isPendingPaymentConflict(error)) {
      ElMessage.warning(pendingPaymentErrorMessage(error))
      emit('conflict')
    } else serverError.value = pendingPaymentErrorMessage(error)
  } finally { saving.value = false }
}
</script>

<template>
  <el-dialog
    :model-value="Boolean(submission)" title="修改付款回報" width="560px"
    :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving"
    @update:model-value="(open: boolean) => { if (!open) close() }"
  >
    <el-form v-if="submission" label-position="top" :disabled="saving">
      <p class="mb-4 text-sm leading-relaxed text-slate-500">管理員確認前可修改付款資料。更換球員、期別或品項，請先刪除此回報再重新填寫。</p>
      <section v-for="(line, index) in submission.items" :key="line.id" class="mb-4 rounded-2xl border border-slate-200 p-4">
        <h4 class="mb-3 whitespace-pre-line break-words font-bold text-slate-700">{{ line.label }}</h4>
        <template v-if="line.expected_amount != null && form.items[index]">
          <div class="mb-3 flex flex-wrap justify-between gap-2 text-sm text-slate-600">
            <span>系統應收 {{ money(line.expected_amount) }}</span>
            <span>正確應付 {{ money(Math.max(0, line.expected_amount - form.items[index]!.balance_amount)) }}</span>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <el-form-item :label="`餘額扣抵（可用 ${money(line.available_balance)}）`" :error="attempted ? lineErrors[index] : ''">
              <el-input-number :model-value="form.items[index]!.balance_amount" :aria-label="`${line.label}餘額扣抵`" :min="0" :precision="0" class="!w-full" size="large" @update:model-value="(value: number | undefined) => changeBalance(index, value)" />
            </el-form-item>
            <el-form-item label="實際付款金額">
              <el-input-number v-model="form.items[index]!.reported_external_amount" :aria-label="`${line.label}實際付款金額`" :min="0" :precision="0" :disabled="submission.kind !== 'membership'" class="!w-full" size="large" />
            </el-form-item>
          </div>
          <p v-if="submission.kind === 'membership' && form.items[index]!.reported_external_amount !== line.expected_amount - form.items[index]!.balance_amount" class="text-sm font-bold text-amber-700">
            實際付款與正確應付不同，請填寫下方原因。
          </p>
        </template>
        <p v-else class="text-sm text-slate-500">此舊回報缺少應收快照，可修改匯款資料；更正金額請刪除後重新回報。</p>
      </section>
      <el-form-item v-if="mismatch" label="金額異常原因" :error="attempted ? errors.reason : ''">
        <el-input v-model="form.amount_mismatch_reason" type="textarea" :rows="2" aria-label="金額異常原因" />
      </el-form-item>
      <div class="grid gap-x-3 sm:grid-cols-2">
        <el-form-item label="匯款日期" :error="attempted ? errors.date : ''">
          <el-date-picker v-model="form.remittance_date" type="date" value-format="YYYY-MM-DD" size="large" class="!w-full" aria-label="匯款日期" />
        </el-form-item>
        <el-form-item label="付款方式" :error="attempted ? errors.method : ''">
          <el-select v-if="totalReported > 0" v-model="form.payment_method" size="large" class="w-full" aria-label="付款方式">
            <el-option v-for="option in methodOptions" :key="option" :label="option" :value="option" />
          </el-select>
          <span v-else class="text-slate-600">餘額扣款</span>
        </el-form-item>
      </div>
      <el-form-item v-if="needsAccount" label="匯款帳號後五碼" :error="attempted ? errors.account : ''">
        <el-input :model-value="form.account_last_5 || ''" maxlength="5" inputmode="numeric" size="large" aria-label="匯款帳號後五碼" @update:model-value="(value: string) => form.account_last_5 = normalizeAccountLast5(value)" />
      </el-form-item>
      <el-form-item label="備註">
        <el-input v-model="form.note" type="textarea" :rows="2" aria-label="備註" />
      </el-form-item>
      <p v-if="serverError" role="alert" class="text-sm text-red-600">{{ serverError }}</p>
    </el-form>
    <template #footer>
      <AppDialogFooter class="[&_.el-button--primary]:!border-primary [&_.el-button--primary]:!bg-primary" confirm-label="儲存修改" :loading="saving" :confirm-disabled="saving" @cancel="close" @confirm="save" />
    </template>
  </el-dialog>
</template>
