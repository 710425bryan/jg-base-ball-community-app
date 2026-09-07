<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit } from '@element-plus/icons-vue'
import PendingPaymentEditDialog from './PendingPaymentEditDialog.vue'
import { deleteMyPendingPaymentSubmission, listMyPendingPaymentSubmissions, pendingPaymentErrorMessage } from '@/services/pendingPayments'
import type { PendingPaymentSubmission } from '@/types/pendingPayments'

const props = withDefaults(defineProps<{ memberId: string; refreshKey?: number }>(), { refreshKey: 0 })
const emit = defineEmits<{ changed: [] }>()
const submissions = ref<PendingPaymentSubmission[]>([])
const editing = ref<PendingPaymentSubmission | null>(null)
const loading = ref(false)
const deleting = ref(false)
const error = ref('')
let requestId = 0

const load = async () => {
  const request = ++requestId
  submissions.value = []
  error.value = ''
  if (!props.memberId) { loading.value = false; return }
  loading.value = true
  try {
    const rows = await listMyPendingPaymentSubmissions(props.memberId)
    if (request === requestId) submissions.value = rows
  } catch (cause) {
    if (request === requestId) error.value = pendingPaymentErrorMessage(cause)
  } finally { if (request === requestId) loading.value = false }
}
watch(() => [props.memberId, props.refreshKey], () => {
  editing.value = null
  void load()
}, { immediate: true })
onBeforeUnmount(() => { requestId++ })
const changed = () => {
  editing.value = null
  void load()
  emit('changed')
}
const remove = async (submission: PendingPaymentSubmission) => {
  if (deleting.value) return
  deleting.value = true
  try {
    try {
      await ElMessageBox.confirm(
        `確定刪除這筆${submission.label}付款回報？${submission.items.map((line) => line.label).join('、')}。僅撤回回報，不會取消原帳款或退還款項；若已付款，請重新填寫回報即可。`,
        '刪除付款回報', { type: 'warning', confirmButtonText: '刪除回報', cancelButtonText: '保留回報' }
      )
    } catch { return }
    await deleteMyPendingPaymentSubmission(submission)
    ElMessage.success('付款回報已刪除，可重新填寫。')
    changed()
  } catch (cause) {
    ElMessage.error(pendingPaymentErrorMessage(cause))
    changed()
  } finally { deleting.value = false }
}
</script>

<template>
  <section id="pending-payment-submissions-section" class="rounded-3xl border border-amber-100 bg-amber-50/50 p-5">
    <h3 class="text-lg font-black text-slate-800">待確認的付款回報</h3>
    <p class="mt-1 text-sm text-slate-500">自己送出的回報，在管理員確認前可修改或刪除；合併回報會一併處理整筆明細。</p>
    <p v-if="loading" class="mt-4 text-sm text-slate-500" role="status">讀取付款回報中…</p>
    <div v-else-if="error" class="mt-4">
      <p role="alert" class="text-sm text-red-600">{{ error }}</p>
      <el-button class="mt-3 !min-h-11" @click="load">重新載入</el-button>
    </div>
    <p v-else-if="submissions.length === 0" class="mt-4 text-sm text-slate-500">目前沒有自己送出的待確認回報。</p>
    <div v-else class="mt-4 grid gap-3 md:grid-cols-2">
      <article v-for="submission in submissions" :key="`${submission.kind}-${submission.id}`" class="rounded-2xl border border-amber-100 bg-white p-4">
        <div class="font-bold text-slate-800">{{ submission.label }} · 待確認</div>
        <p v-for="line in submission.items" :key="line.id" class="mt-2 whitespace-pre-line break-words text-sm text-slate-600">{{ line.label }}</p>
        <p class="mt-2 text-sm text-slate-500">{{ submission.remittance_date }}｜{{ submission.payment_method }}<span v-if="submission.account_last_5">｜後五碼 {{ submission.account_last_5 }}</span></p>
        <p class="mt-2 text-sm text-slate-600">實付 ${{ submission.items.reduce((sum, line) => sum + line.reported_external_amount, 0).toLocaleString('en-US') }}｜餘額扣抵 ${{ submission.items.reduce((sum, line) => sum + line.balance_amount, 0).toLocaleString('en-US') }}</p>
        <p v-if="submission.note" class="mt-2 whitespace-pre-line break-words text-sm text-slate-500">{{ submission.note }}</p>
        <div class="mt-4 flex gap-2">
          <el-button :icon="Edit" class="!m-0 !min-h-11 flex-1" :disabled="deleting" @click="editing = submission">修改回報</el-button>
          <el-button :icon="Delete" type="danger" plain class="!m-0 !min-h-11 flex-1" :disabled="deleting" @click="remove(submission)">刪除回報</el-button>
        </div>
      </article>
    </div>
    <PendingPaymentEditDialog :submission="editing" @close="editing = null" @saved="changed" @conflict="changed" />
  </section>
</template>
