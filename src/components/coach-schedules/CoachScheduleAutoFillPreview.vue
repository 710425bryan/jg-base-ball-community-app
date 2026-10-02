<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { coachScheduleTemplatesApi } from '@/services/coachScheduleTemplatesApi'
import type { SchedulableCoach } from '@/types/coachSchedule'
import type { CoachScheduleAutoFillPreview, CoachScheduleAutoFillRow } from '@/types/coachScheduleTemplate'
import { formatCoachScheduleDateLabel, formatCoachScheduleTimeRange } from '@/utils/coachSchedules'
import { getCoachScheduleExclusionLabel } from '@/utils/coachScheduleTemplates'

const props = defineProps<{ modelValue: boolean; month: string; coaches: SchedulableCoach[]; canCreate: boolean; canEdit: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void; (event: 'saved'): void }>()
const preview = ref<CoachScheduleAutoFillPreview>({ fingerprint: '', rows: [] })
const selectedKeys = ref<string[]>([])
const loading = ref(false)
const saving = ref(false)
let generation = 0
const canSelect = (row: CoachScheduleAutoFillRow) => row.proposed_coach_profile_ids.length > 0
  && (row.event.is_persisted ? props.canEdit : props.canCreate)
const selectedRows = computed(() => preview.value.rows.filter((row) => selectedKeys.value.includes(row.event_key) && canSelect(row)))
const coachNames = (ids: string[]) => ids.map((id) => {
  const coach = props.coaches.find((row) => row.id === id)
  return coach?.nickname || coach?.name || '教練'
}).join('、')
const load = async () => {
  const request = ++generation
  loading.value = true
  selectedKeys.value = []
  try {
    const data = await coachScheduleTemplatesApi.preview(props.month)
    if (request !== generation || !props.modelValue) return
    preview.value = data
    selectedKeys.value = data.rows.filter(canSelect).map((row) => row.event_key)
  } catch (error: any) {
    preview.value = { fingerprint: '', rows: [] }
    ElMessage.error(error?.message || '無法產生自動排班預覽')
  } finally { if (request === generation) loading.value = false }
}
watch(() => props.modelValue, (open) => {
  if (open) void load()
  else generation += 1
}, { immediate: true })
const confirm = async () => {
  if (loading.value || saving.value || !selectedRows.value.length || !preview.value.fingerprint) return
  saving.value = true
  try {
    await coachScheduleTemplatesApi.confirm(props.month, preview.value.fingerprint, selectedRows.value.map((row) => row.event_key))
    ElMessage.success('已帶入選取的教練排班')
    emit('saved')
    emit('update:modelValue', false)
  } catch (error: any) {
    ElMessage.error(error?.message || '自動排班未完成，請重新產生預覽後再確認。')
    selectedKeys.value = []
    preview.value.fingerprint = ''
  } finally { saving.value = false }
}
const close = (done?: () => void) => {
  if (saving.value) return
  if (done) done()
  else emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="自動帶入排班預覽" class="coach-feature-theme" width="92%" style="max-width: 850px" :before-close="close"
    @update:model-value="emit('update:modelValue', $event)">
    <p class="mb-4 text-sm leading-relaxed text-slate-600">依場地範本帶入本月今天起、尚未指定教練的訓練活動。已排班活動保留；請假、帳號失效及時段衝突的教練會排除，空缺需另行補派。</p>
    <p v-if="!loading && preview.rows.length && !preview.fingerprint" class="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800" role="alert">此預覽已失效，請重新產生預覽後再確認。</p>
    <AppLoadingState v-if="loading" text="產生排班預覽中..." min-height="180px" />
    <div v-else class="grid gap-3">
      <p v-if="!preview.rows.length" class="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">沒有可帶入的活動，請確認該場地已有啟用範本及尚未指派教練的訓練活動。</p>
      <article v-for="row in preview.rows" :key="row.event_key" class="min-w-0 rounded-xl border border-slate-200 p-3" data-test="auto-fill-row">
        <el-checkbox-group v-model="selectedKeys" :disabled="saving">
          <el-checkbox :value="row.event_key" :disabled="!canSelect(row)" class="!h-auto !min-h-11 !whitespace-normal">
            <span class="whitespace-normal break-words font-bold text-slate-800">{{ formatCoachScheduleDateLabel(row.event.schedule_date) }} {{ row.event.title }}</span>
          </el-checkbox>
        </el-checkbox-group>
        <p class="text-sm text-slate-600">{{ formatCoachScheduleTimeRange(row.event) }}｜{{ row.event.location || '地點未定' }}｜{{ row.template_name }}</p>
        <p class="mt-2 break-words text-sm">帶入教練：{{ coachNames(row.proposed_coach_profile_ids) || '無可用教練' }}</p>
        <p v-if="row.excluded_coaches.length" class="mt-2 break-words text-sm text-amber-800">
          排除：{{ row.excluded_coaches.map((coach) => `${coach.name}（${getCoachScheduleExclusionLabel(coach.reason)}）`).join('、') }}
        </p>
        <p v-if="row.vacancy_count" class="mt-2 text-sm font-bold text-amber-700">待補 {{ row.vacancy_count }} 位教練</p>
        <p v-if="row.time_incomplete" class="mt-2 text-sm text-amber-700">時間不完整，依全日檢查請假與排班衝突。</p>
        <p v-if="row.proposed_coach_profile_ids.length && !canSelect(row)" class="mt-2 text-sm text-slate-500">需要此活動的{{ row.event.is_persisted ? '編輯' : '新增' }}權限。</p>
      </article>
    </div>
    <template #footer>
      <AppDialogFooter :confirm-label="`確認帶入 ${selectedRows.length} 筆`" :loading="saving"
        :confirm-disabled="loading || !selectedRows.length || !preview.fingerprint" @cancel="close()" @confirm="confirm">
        <template #leading><el-button class="!min-h-11" :disabled="loading || saving" @click="load">重新產生預覽</el-button></template>
      </AppDialogFooter>
    </template>
  </el-dialog>
</template>
