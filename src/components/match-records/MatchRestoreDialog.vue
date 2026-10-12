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
  (event: 'restored', match: MatchRecord): void
}>()
const matchesStore = useMatchesStore()
const permissionsStore = usePermissionsStore()
const snapshot = shallowRef<MatchRecord | null>(null)
const saving = ref(false)
const errorMessage = ref('')
const canRestore = computed(() => Boolean(permissionsStore.can('matches', 'EDIT')
  && snapshot.value?.cancelled_at && snapshot.value.match_level !== '特訓課'))
const versionAvailable = computed(() => Boolean(snapshot.value?.updated_at))

watch([() => props.modelValue, () => props.match?.id], ([open]) => {
  if (!open || saving.value) return
  snapshot.value = props.match ? { ...props.match } : null
  errorMessage.value = snapshot.value && !versionAvailable.value
    ? '賽事版本資料不足，請重新整理頁面後再開啟恢復比賽。' : ''
}, { immediate: true })

const close = () => { if (!saving.value) emit('update:modelValue', false) }
const submit = async () => {
  if (saving.value) return
  if (!props.modelValue || !canRestore.value || !snapshot.value || !permissionsStore.can('matches', 'EDIT')) {
    errorMessage.value = '此賽事無法恢復或您沒有編輯權限'
    return
  }
  if (!snapshot.value.updated_at) {
    errorMessage.value = '賽事版本資料不足，請重新整理頁面後再開啟恢復比賽。'
    return
  }
  saving.value = true
  errorMessage.value = ''
  const match = snapshot.value
  const expectedUpdatedAt = snapshot.value.updated_at
  try {
    const restored = await matchesStore.restoreMatch(match.id, expectedUpdatedAt)
    ElMessage.success('已恢復比賽')
    emit('restored', restored)
    emit('update:modelValue', false)
  } catch (error: any) {
    errorMessage.value = error?.message || '恢復失敗，請稍後再試'
  } finally { saving.value = false }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="恢復比賽" width="560px"
    :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving"
    @update:model-value="close">
    <div v-if="snapshot" class="space-y-4">
      <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label="待恢復賽事">
        <h3 class="text-lg font-black text-slate-800">{{ snapshot.match_name }}</h3>
        <p class="mt-1 text-sm text-slate-600">中港熊戰 VS {{ snapshot.opponent || '待確認' }}</p>
        <p class="my-3 text-base font-black text-slate-800">{{ snapshot.match_date || '日期待確認' }}</p>
        <MatchScheduleInfo :match="snapshot" />
      </section>
      <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
        <p class="font-bold">確認恢復這場比賽？</p>
        <p class="mt-2">恢復後重新列入正常賽程與統計，後續行事曆同步及符合條件的賽前提醒也會恢復。本次操作不會立即發送推播。</p>
        <p class="mt-2">比賽費需重新確認並開放繳費；原有已付款與待確認紀錄會保留。</p>
        <p class="mt-2">原教練排班資料會保留；如有請假或時段衝突，請至教練排班確認。</p>
      </div>
      <p v-if="errorMessage" role="alert" class="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{{ errorMessage }}</p>
    </div>
    <template #footer>
      <div class="grid grid-cols-2 gap-3">
        <el-button class="!m-0 !min-h-11 !rounded-xl" :disabled="saving" @click="close">返回</el-button>
        <el-button type="primary" class="!m-0 !min-h-11 !rounded-xl !bg-primary !border-primary" :loading="saving"
          :disabled="!canRestore || !versionAvailable" @click="submit">確認恢復比賽</el-button>
      </div>
    </template>
  </el-dialog>
</template>
