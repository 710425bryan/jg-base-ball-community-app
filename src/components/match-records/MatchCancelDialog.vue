<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useMatchesStore } from '@/stores/matches'
import { usePermissionsStore } from '@/stores/permissions'
import type { MatchRecord } from '@/types/match'
import MatchScheduleInfo from './MatchScheduleInfo.vue'

const props = defineProps<{ modelValue: boolean; match: MatchRecord | null }>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'cancelled', match: MatchRecord): void
}>()
const matchesStore = useMatchesStore()
const permissionsStore = usePermissionsStore()
const snapshot = shallowRef<MatchRecord | null>(null)
const reason = ref('')
const explanation = ref('')
const saving = ref(false)
const errorMessage = ref('')
const reasons = ['天候不佳', '場地無法使用', '對手取消', '行程調整', '其他']
const combinedReason = computed(() => reason.value === '其他' ? explanation.value.trim()
  : [reason.value, explanation.value.trim()].filter(Boolean).join('：'))
const canCancel = computed(() => permissionsStore.can('matches', 'EDIT')
  && snapshot.value && !snapshot.value.cancelled_at && snapshot.value.match_level !== '特訓課')

watch([() => props.modelValue, () => props.match?.id], ([open]) => {
  if (!open || saving.value) return
  snapshot.value = props.match ? { ...props.match } : null
  reason.value = ''
  explanation.value = ''
  errorMessage.value = snapshot.value && !snapshot.value.updated_at
    ? '賽事版本資料不足，請重新整理頁面後再開啟取消比賽。' : ''
}, { immediate: true })

const close = () => { if (!saving.value) emit('update:modelValue', false) }
const submit = async () => {
  if (saving.value) return
  if (!props.modelValue || !canCancel.value || !snapshot.value || !permissionsStore.can('matches', 'EDIT')) { errorMessage.value = '此賽事無法取消或您沒有編輯權限'; return }
  if (!snapshot.value.updated_at) {
    errorMessage.value = '賽事版本資料不足，請重新整理頁面後再開啟取消比賽。'
    return
  }
  if (!reason.value || !combinedReason.value || combinedReason.value.length > 500) {
    errorMessage.value = '請選擇取消原因；選擇其他時請填寫說明，合計最多 500 字'
    return
  }
  saving.value = true
  errorMessage.value = ''
  const match = snapshot.value
  const expectedUpdatedAt = snapshot.value.updated_at
  try {
    const cancelled = await matchesStore.cancelMatch(match.id, combinedReason.value, expectedUpdatedAt)
    ElMessage.success('已取消比賽，賽事資料已保留')
    emit('cancelled', cancelled)
    emit('update:modelValue', false)
  } catch (error: any) {
    errorMessage.value = error?.message || '取消失敗，請稍後再試'
  } finally { saving.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="取消比賽" width="560px"
    :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving"
    @update:model-value="close">
    <div v-if="snapshot" class="space-y-5">
      <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label="待取消賽事">
        <h3 class="text-lg font-black text-slate-800">{{ snapshot.match_name }}</h3>
        <p class="mb-3 text-sm text-slate-600">中港熊戰 VS {{ snapshot.opponent || '待確認' }}</p>
        <p class="mb-3 text-base font-black text-slate-800">{{ snapshot.match_date || '日期待確認' }}</p>
        <MatchScheduleInfo :match="snapshot" />
      </section>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="取消原因" required>
          <el-select v-model="reason" placeholder="請選擇取消原因" class="w-full" size="large" :disabled="saving" aria-label="取消原因">
            <el-option v-for="option in reasons" :key="option" :label="option" :value="option" />
          </el-select>
        </el-form-item>
        <el-form-item :label="reason === '其他' ? '補充說明（必填）' : '補充說明'">
          <el-input v-model="explanation" type="textarea" :rows="3" :maxlength="480" show-word-limit
            :disabled="saving" placeholder="請說明取消原因" aria-label="補充說明" />
        </el-form-item>
      </el-form>
      <div class="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
        <p>取消後保留賽事資料與照片，並停止賽前提醒，不計入賽事成績與出席統計。</p>
        <p class="mt-2">如有待確認或已付款紀錄，款項需另行處理。</p>
      </div>
      <p v-if="errorMessage" role="alert" class="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{{ errorMessage }}</p>
    </div>
    <template #footer>
      <div class="grid grid-cols-2 gap-3">
        <el-button class="!m-0 !min-h-11 !rounded-xl" :disabled="saving" @click="close">返回</el-button>
        <el-button type="danger" class="!m-0 !min-h-11 !rounded-xl" :loading="saving" :disabled="!canCancel || !snapshot?.updated_at" @click="submit">確認取消比賽</el-button>
      </div>
    </template>
  </el-dialog>
</template>
