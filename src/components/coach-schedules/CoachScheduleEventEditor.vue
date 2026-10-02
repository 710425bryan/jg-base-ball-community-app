<script setup lang="ts">
import { computed } from 'vue'
import { Check, MoreFilled } from '@element-plus/icons-vue'
import CoachScheduleEventSummary from './CoachScheduleEventSummary.vue'
import type { CoachScheduleEvent, SchedulableCoach } from '@/types/coachSchedule'
import type { CoachScheduleFormState } from '@/composables/useCoachScheduleEditor'
import { usePermissionsStore } from '@/stores/permissions'
import { buildCoachScheduleCoachGroups } from '@/utils/coachScheduleCoachOptions'
import { canCopyCoachScheduleTemplate } from '@/utils/coachScheduleTemplates'

const props = defineProps<{
  event: CoachScheduleEvent; form: CoachScheduleFormState; coaches: SchedulableCoach[]
  canCreate: boolean; canEdit: boolean; canDelete: boolean; saving: boolean; deleting: boolean; coachLoading: boolean
}>()
const emit = defineEmits<{
  (event: 'update:form', value: CoachScheduleFormState): void
  (event: 'save'): void
  (event: 'delete'): void
  (event: 'copy-template'): void
}>()
const permissionsStore = usePermissionsStore()
const coachGroups = computed(() => buildCoachScheduleCoachGroups(props.coaches, permissionsStore.roles))
const canSave = computed(() => props.event.is_persisted ? props.canEdit : props.canCreate)
const update = (value: Partial<CoachScheduleFormState>) => emit('update:form', { ...props.form, ...value })
const coachIds = computed({ get: () => props.form.coachProfileIds, set: (value) => update({ coachProfileIds: value }) })
const status = computed({ get: () => props.form.status, set: (value) => update({ status: value }) })
const note = computed({ get: () => props.form.note, set: (value) => update({ note: value }) })
const coachName = (coach: SchedulableCoach) => coach.nickname || coach.name
const assignedNames = computed(() => props.form.coachProfileIds.map((id) => {
  const coach = props.coaches.find((row) => row.id === id)
  const assignment = props.event.assignments.find((row) => row.coach_profile_id === id)
  return coach ? coachName(coach) : assignment?.coach_nickname || assignment?.coach_name || id
}))
const removedNames = computed(() => [...new Set((props.event.assignment_changes || [])
  .filter((change) => !props.event.coach_profile_ids.includes(change.coach_profile_id))
  .map((change) => change.coach_name).filter(Boolean))])
const handleCommand = (command: string) => {
  if (props.saving || props.deleting) return
  if (command === 'copy' && props.canCreate && canCopyCoachScheduleTemplate(props.event)) emit('copy-template')
  else if (command === 'delete' && props.event.is_persisted && props.canDelete) emit('delete')
}
</script>

<template>
  <article class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:p-5" data-test="coach-schedule-event">
    <div class="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <div class="min-w-0">
        <CoachScheduleEventSummary :event="event" :assigned-coach-names="assignedNames" />
        <p v-if="removedNames.length" class="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800" data-test="leave-removal">
          因請假移除：{{ removedNames.join('、') }}。請視需要補派教練。
        </p>
        <p v-if="event.is_persisted && event.status === 'scheduled' && !form.coachProfileIds.length" class="mt-3 text-sm font-bold text-amber-700">目前沒有教練，待補排班。</p>
      </div>
      <div class="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
        <el-form-item label="指派教練" class="mb-0 font-bold">
          <el-select v-model="coachIds" multiple filterable :reserve-keyword="false" collapse-tags collapse-tags-tooltip :loading="coachLoading"
            :disabled="!canSave || saving" placeholder="選擇教練" class="!w-full" size="large" data-test="card-coaches-select">
            <el-option-group v-for="group in coachGroups" :key="group.key" :label="group.label" data-test="schedule-coach-role-group">
              <el-option v-for="coach in group.coaches" :key="coach.id" :label="`${coachName(coach)}${event.unavailable_coach_profile_ids?.includes(coach.id) ? '（請假）' : ''}`"
                :value="coach.id" :disabled="event.unavailable_coach_profile_ids?.includes(coach.id)" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <div class="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
          <el-form-item label="狀態" class="mb-0 font-bold">
            <el-select v-model="status" :disabled="!canSave || saving" class="!w-full" size="large">
              <el-option label="正常上課" value="scheduled" /><el-option label="取消" value="cancelled" />
            </el-select>
          </el-form-item>
          <el-form-item label="備註" class="mb-0 font-bold">
            <el-input v-model="note" :disabled="!canSave || saving" placeholder="例：投手分組、客場支援" maxlength="120" show-word-limit size="large" />
          </el-form-item>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <el-dropdown v-if="(canCreate && canCopyCoachScheduleTemplate(event)) || (event.is_persisted && canDelete)" trigger="click"
            @command="handleCommand">
            <el-button class="!min-h-11" :disabled="saving || deleting" aria-label="更多排班操作" title="更多排班操作"><el-icon><MoreFilled /></el-icon>更多</el-button>
            <template #dropdown><el-dropdown-menu>
              <el-dropdown-item v-if="canCreate && canCopyCoachScheduleTemplate(event)" command="copy">建立固定範本</el-dropdown-item>
              <el-dropdown-item v-if="event.is_persisted && canDelete" command="delete">刪除排班</el-dropdown-item>
            </el-dropdown-menu></template>
          </el-dropdown>
          <el-button v-if="canSave" type="primary" class="!min-h-11" :loading="saving" :disabled="deleting" @click="emit('save')">
            <el-icon><Check /></el-icon>{{ event.is_persisted ? '更新排班' : '儲存排班' }}
          </el-button>
        </div>
      </div>
    </div>
  </article>
</template>
