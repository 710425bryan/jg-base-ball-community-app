<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { SchedulableCoach } from '@/types/coachSchedule'
import type { CoachLeaveRequest, CoachLeaveSaveInput } from '@/types/coachLeaveRequest'
import type { CoachLeaveBatchCreateInput, CoachLeaveClassDateLoader } from '@/types/coachLeaveDateSelection'
import CoachLeaveDateSelection from './CoachLeaveDateSelection.vue'
import { buildCoachLeaveDateRecords, createCoachLeaveDateSelection } from '@/utils/coachLeaveDateSelection'
import {
  COACH_LEAVE_TIME_SEGMENTS, createCoachLeaveRequestId, getTaiwanToday, validateCoachLeaveInput
} from '@/utils/coachLeaveRequests'

const props = withDefaults(defineProps<{
  modelValue: boolean
  manage?: boolean
  leave?: CoachLeaveRequest | null
  coaches: SchedulableCoach[]
  ownCoachName?: string
  saving?: boolean
  serverError?: string
  loadClassDates?: CoachLeaveClassDateLoader
}>(), { manage: false, leave: null, ownCoachName: '', saving: false, serverError: '' })
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'save', input: CoachLeaveSaveInput, requestId: string | null): void
  (event: 'create', input: CoachLeaveBatchCreateInput, requestId: string): void
}>()
const form = reactive<CoachLeaveSaveInput>({
  coach_profile_id: '', start_date: '', end_date: '', time_segment: 'full_day', reason: ''
})
const errors = ref<ReturnType<typeof validateCoachLeaveInput>>({})
const requestId = ref<string | null>(null)
const requestPayloadSignature = ref('')
const dateSelection = ref(createCoachLeaveDateSelection(getTaiwanToday()))
const dateError = ref('')
const isMultiDay = computed(() => props.leave ? form.start_date !== form.end_date
  : dateSelection.value.mode === 'range' && dateSelection.value.rangeStart !== dateSelection.value.rangeEnd)
const coachName = computed(() => props.leave?.coach_nickname || props.leave?.coach_name || props.ownCoachName)
const isOngoingLeave = computed(() => !!props.leave
  && props.leave.start_date < getTaiwanToday() && props.leave.end_date >= getTaiwanToday())

watch(() => props.modelValue, (open) => {
  if (!open) return
  const today = getTaiwanToday()
  Object.assign(form, {
    id: props.leave?.id || null,
    updated_at: props.leave?.updated_at || null,
    coach_profile_id: props.leave?.coach_profile_id || '',
    start_date: props.leave && props.leave.start_date >= today ? props.leave.start_date : today,
    end_date: props.leave?.end_date || today,
    time_segment: props.leave?.time_segment || 'full_day',
    reason: props.leave?.reason || ''
  })
  errors.value = {}
  dateError.value = ''
  dateSelection.value = createCoachLeaveDateSelection(today)
  requestId.value = props.leave ? null : createCoachLeaveRequestId()
  requestPayloadSignature.value = ''
}, { immediate: true })

watch(() => form.start_date, (date) => {
  if (date && (!form.end_date || date > form.end_date)) form.end_date = date
})
watch(isMultiDay, (multiDay) => { if (multiDay) form.time_segment = 'full_day' })

const disabledDate = (date: Date) => {
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return localDate < getTaiwanToday()
}
const close = () => { if (!props.saving) emit('update:modelValue', false) }
const submit = () => {
  if (props.saving) return
  dateError.value = ''
  if (!props.leave) {
    let records
    try { records = buildCoachLeaveDateRecords(dateSelection.value, form.time_segment, getTaiwanToday()) }
    catch (error) { dateError.value = error instanceof Error ? error.message : '請選擇有效的請假日期。'; return }
    const input: CoachLeaveBatchCreateInput = {
      coach_profile_id: props.manage ? form.coach_profile_id : undefined,
      records,
      reason: form.reason?.trim() || null
    }
    errors.value = validateCoachLeaveInput({ ...records[0]!, coach_profile_id: input.coach_profile_id, reason: input.reason }, props.manage)
    if (Object.keys(errors.value).length === 0) {
      const signature = JSON.stringify(input)
      if (!requestId.value || (requestPayloadSignature.value && requestPayloadSignature.value !== signature)) {
        requestId.value = createCoachLeaveRequestId()
      }
      requestPayloadSignature.value = signature
      emit('create', input, requestId.value)
    }
    return
  }
  const input: CoachLeaveSaveInput = {
    ...form,
    coach_profile_id: props.manage ? props.leave?.coach_profile_id || form.coach_profile_id : undefined,
    reason: form.reason?.trim() || null
  }
  errors.value = validateCoachLeaveInput(input, props.manage)
  if (Object.keys(errors.value).length === 0) emit('save', input, requestId.value)
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="leave ? '修改教練假單' : '新增教練假單'"
    width="560px"
    append-to-body
    destroy-on-close
    class="coach-leave-dialog coach-feature-theme"
    :show-close="!saving"
    :close-on-click-modal="!saving"
    :close-on-press-escape="!saving"
    @update:model-value="close"
  >
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item v-if="manage && !leave" label="教練" :error="errors.coach_profile_id">
        <el-select v-model="form.coach_profile_id" filterable size="large" class="w-full" placeholder="選擇教練" :disabled="saving">
          <el-option v-for="coach in coaches" :key="coach.id" :value="coach.id" :label="coach.nickname || coach.name" />
        </el-select>
      </el-form-item>
      <p v-else class="mb-4 rounded-xl bg-primary/5 p-3 font-bold text-slate-700" data-test="fixed-coach">
        請假教練：{{ coachName }}
      </p>
      <p v-if="isOngoingLeave" class="mb-4 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-800" data-test="ongoing-leave-notice">
        此假單已開始；修改後只保留今天起的請假範圍，原範圍保留於異動紀錄。已移除的教練指派不會自動恢復。
      </p>
      <CoachLeaveDateSelection v-if="!leave" v-model="dateSelection" :open="modelValue" :disabled="saving" :error="dateError" :load-class-dates="loadClassDates" />
      <div v-else class="grid min-w-0 gap-3 md:grid-cols-2">
        <el-form-item label="開始日期" :error="errors.start_date">
          <el-date-picker
            v-model="form.start_date" type="date" format="YYYY/MM/DD" value-format="YYYY-MM-DD"
            placeholder="開始日期" size="large" class="!w-full" :clearable="false"
            :disabled-date="disabledDate" :disabled="saving"
          />
        </el-form-item>
        <el-form-item label="結束日期" :error="errors.end_date">
          <el-date-picker
            v-model="form.end_date" type="date" format="YYYY/MM/DD" value-format="YYYY-MM-DD"
            placeholder="結束日期" size="large" class="!w-full" :clearable="false"
            :disabled-date="disabledDate" :disabled="saving"
          />
        </el-form-item>
      </div>
      <el-form-item label="請假時段" :error="errors.time_segment">
        <el-select v-model="form.time_segment" size="large" class="w-full" :disabled="saving || isMultiDay">
          <el-option v-for="segment in COACH_LEAVE_TIME_SEGMENTS" :key="segment.value" :value="segment.value" :label="segment.label" />
        </el-select>
        <p class="mt-2 w-full text-sm leading-relaxed text-slate-500">上午與下午以台灣時間 13:00 分界；各筆單日可選半日，連續多日請假為全日。</p>
      </el-form-item>
      <el-form-item label="請假原因（選填）" :error="errors.reason">
        <el-input v-model="form.reason" type="textarea" :rows="3" maxlength="500" show-word-limit :disabled="saving" placeholder="最多 500 字" />
      </el-form-item>
      <p class="text-sm leading-relaxed text-slate-500">儲存後立即生效，重疊時段的教練指派會移除並標示待補人。取消假單不會自動恢復指派，需由管理者重新排班。</p>
      <p v-if="serverError" class="mt-3 text-sm font-bold text-red-600" role="alert">{{ serverError }}</p>
    </el-form>
    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <el-button class="!ml-0 !min-h-11" :disabled="saving" @click="close">取消</el-button>
        <el-button type="primary" class="!ml-0 !min-h-11" :loading="saving" data-test="save-leave" @click="submit">{{ leave ? '儲存變更' : '送出假單' }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style>
@media (max-width: 767px) {
  .coach-leave-dialog {
    display: flex; flex-direction: column; width: 100% !important; margin: 0 !important;
    height: 100dvh; min-height: 100dvh; overflow: hidden; border-radius: 0;
  }
  .coach-leave-dialog .el-dialog__header {
    flex: none; padding-top: calc(16px + env(safe-area-inset-top));
    padding-right: calc(60px + env(safe-area-inset-right));
  }
  .coach-leave-dialog .el-dialog__headerbtn {
    width: 44px; height: 44px;
    top: calc(8px + env(safe-area-inset-top)); right: calc(8px + env(safe-area-inset-right));
  }
  .coach-leave-dialog .el-dialog__body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
  .coach-leave-dialog .el-dialog__footer { flex: none; padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
  .coach-leave-dialog :is(.el-input__inner, .el-textarea__inner, .el-select__input) { font-size: 16px; }
}
</style>
