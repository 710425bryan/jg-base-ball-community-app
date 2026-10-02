<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import { coachSchedulesApi } from '@/services/coachSchedulesApi'
import type { SchedulableCoach } from '@/types/coachSchedule'
import { usePermissionsStore } from '@/stores/permissions'
import { buildCoachScheduleCoachGroups } from '@/utils/coachScheduleCoachOptions'

const props = defineProps<{ modelValue: boolean; month: string; coaches: SchedulableCoach[]; canCreate: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void; (event: 'saved'): void }>()
const permissionsStore = usePermissionsStore()
const coachGroups = computed(() => buildCoachScheduleCoachGroups(props.coaches, permissionsStore.roles))
const saving = ref(false)
const form = reactive({ title: '', schedule_date: '', timeRange: [] as string[], location: '', note: '', coachProfileIds: [] as string[] })
watch(() => props.modelValue, (open) => {
  if (open) Object.assign(form, { title: '', schedule_date: `${props.month}-01`, timeRange: [], location: '', note: '', coachProfileIds: [] })
}, { immediate: true })
const save = async () => {
  if (!props.canCreate || saving.value) return
  if (!form.title.trim() || !form.schedule_date) { ElMessage.warning('請輸入排班標題與日期'); return }
  saving.value = true
  try {
    await coachSchedulesApi.saveEvent({
      source_type: 'manual', schedule_date: form.schedule_date, start_time: form.timeRange?.[0] || null,
      end_time: form.timeRange?.[1] || null, title: form.title.trim(), location: form.location.trim() || null,
      note: form.note.trim() || null, status: 'scheduled', coach_profile_ids: [...form.coachProfileIds]
    })
    ElMessage.success('手動排班已新增')
    emit('saved')
    emit('update:modelValue', false)
  } catch (error: any) { ElMessage.error(error?.message || '新增手動排班失敗') }
  finally { saving.value = false }
}
const close = (done?: () => void) => {
  if (saving.value) return
  if (done) done()
  else emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="新增手動排班" class="coach-manual-dialog coach-feature-theme" width="92%" style="max-width: 520px" :before-close="close"
    @update:model-value="emit('update:modelValue', $event)">
    <el-form label-position="top" class="grid gap-3" :disabled="saving || !canCreate">
      <el-form-item label="標題" class="mb-0"><el-input v-model="form.title" placeholder="例：投捕加練" size="large" /></el-form-item>
      <div class="grid gap-3 md:grid-cols-2">
        <el-form-item label="日期" class="mb-0"><el-date-picker v-model="form.schedule_date" type="date" value-format="YYYY-MM-DD" format="YYYY-MM-DD" class="!w-full" size="large" /></el-form-item>
        <el-form-item label="時間" class="mb-0"><el-time-picker v-model="form.timeRange" is-range range-separator="-" start-placeholder="開始" end-placeholder="結束"
          value-format="HH:mm" format="HH:mm" class="!w-full" size="large" /></el-form-item>
      </div>
      <el-form-item label="地點" class="mb-0"><el-input v-model="form.location" placeholder="例：中港國小" size="large" /></el-form-item>
      <el-form-item label="指派教練" class="mb-0"><el-select v-model="form.coachProfileIds" multiple filterable :reserve-keyword="false" collapse-tags collapse-tags-tooltip class="!w-full" size="large" data-test="manual-coaches-select">
        <el-option-group v-for="group in coachGroups" :key="group.key" :label="group.label" data-test="manual-coach-role-group">
          <el-option v-for="coach in group.coaches" :key="coach.id" :label="coach.nickname || coach.name" :value="coach.id" />
        </el-option-group>
      </el-select></el-form-item>
      <el-form-item label="備註" class="mb-0"><el-input v-model="form.note" type="textarea" :rows="3" maxlength="160" show-word-limit /></el-form-item>
    </el-form>
    <template #footer><AppDialogFooter confirm-label="新增" :loading="saving" :confirm-disabled="!canCreate" @cancel="close()" @confirm="save" /></template>
  </el-dialog>
</template>

<style>
@media (max-width: 767px) {
  .coach-manual-dialog :is(.el-input__wrapper, .el-select__wrapper) { min-height: 44px !important; }
  .coach-manual-dialog :is(.el-input__inner, .el-select__input, .el-range-input, .el-textarea__inner) { font-size: 16px; }
}
</style>
