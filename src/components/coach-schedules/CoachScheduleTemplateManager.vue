<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { coachScheduleTemplatesApi } from '@/services/coachScheduleTemplatesApi'
import { usePermissionsStore } from '@/stores/permissions'
import type { SchedulableCoach } from '@/types/coachSchedule'
import type { CoachScheduleTemplate, CoachScheduleTemplateInput, CoachScheduleTemplateVenue } from '@/types/coachScheduleTemplate'
import { createCoachScheduleTemplate } from '@/utils/coachScheduleTemplates'
import { buildCoachScheduleCoachGroups } from '@/utils/coachScheduleCoachOptions'

const props = defineProps<{
  modelValue: boolean; seed: CoachScheduleTemplateInput | null; coaches: SchedulableCoach[]
  canCreate: boolean; canEdit: boolean; canDelete: boolean
}>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
const permissionsStore = usePermissionsStore()
const coachGroups = computed(() => buildCoachScheduleCoachGroups(props.coaches, permissionsStore.roles))
const templates = ref<CoachScheduleTemplate[]>([])
const venues = ref<CoachScheduleTemplateVenue[]>([])
const editing = ref<CoachScheduleTemplateInput | null>(null)
const baseline = ref('')
const venueSelection = ref('')
const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const needsReload = ref(false)
const loadError = ref('')
const saveError = ref('')
const errors = ref({ venue: '', coaches: '' })
let generation = 0
const busy = computed(() => loading.value || saving.value || deleting.value)
const canSave = computed(() => !needsReload.value && (editing.value?.id ? props.canEdit : props.canCreate))
const dirty = computed(() => Boolean(editing.value && JSON.stringify(editing.value) !== baseline.value))
const venueOptions = computed(() => {
  const current = editing.value
  if (!current?.venue_id || venues.value.some((venue) => venue.id === current.venue_id)) return venues.value
  return [...venues.value, { id: current.venue_id, name: `${current.venue_name || '原場地'}（目前未列於啟用場地）` }]
})
const coachNames = (ids: string[]) => ids.map((id) => {
  const coach = props.coaches.find((row) => row.id === id)
  return coach?.nickname || coach?.name || '已停用或未提供的教練'
}).join('、') || '尚未設定教練'
const edit = (template: CoachScheduleTemplateInput) => {
  editing.value = {
    id: template.id, updated_at: template.updated_at, match_mode: 'venue', name: template.name,
    is_active: template.is_active, venue_id: template.venue_id, venue_name: template.venue_name,
    coach_profile_ids: [...template.coach_profile_ids]
  }
  venueSelection.value = template.venue_id || template.venue_name
  baseline.value = JSON.stringify(editing.value)
  needsReload.value = false
  saveError.value = ''
  errors.value = { venue: '', coaches: '' }
}
const setField = <K extends 'name' | 'is_active' | 'coach_profile_ids'>(field: K, value: CoachScheduleTemplateInput[K]) => {
  if (!editing.value || !canSave.value || busy.value) return
  editing.value[field] = value
  saveError.value = ''
  if (field === 'coach_profile_ids') errors.value.coaches = ''
}
const setVenue = (value: string | null) => {
  if (!editing.value || !canSave.value || busy.value) return
  venueSelection.value = value || ''
  const venue = venueOptions.value.find((row) => row.id === value)
  editing.value.venue_id = venue?.id || null
  editing.value.venue_name = venue ? (venues.value.find((row) => row.id === venue.id)?.name || editing.value.venue_name) : value || ''
  errors.value.venue = ''
  saveError.value = ''
}
const confirmDiscard = async () => {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('固定範本尚未儲存，是否捨棄變更？', '未儲存的變更', {
      confirmButtonText: '捨棄變更', cancelButtonText: '繼續編輯', type: 'warning'
    })
    return true
  } catch { return false }
}
const selectTemplate = async (template: CoachScheduleTemplate) => {
  if (busy.value || !await confirmDiscard() || busy.value || !props.modelValue) return
  edit(template)
}
const create = async () => {
  if (!props.canCreate || busy.value || !await confirmDiscard()) return
  if (props.canCreate && !busy.value && props.modelValue) edit(createCoachScheduleTemplate())
}
const load = async () => {
  const request = ++generation
  loading.value = true
  loadError.value = ''
  const results = await Promise.allSettled([coachScheduleTemplatesApi.list(), coachScheduleTemplatesApi.listVenues(), permissionsStore.fetchRoles()])
  if (request !== generation || !props.modelValue) return
  const [templateResult, venueResult] = results
  if (templateResult.status === 'fulfilled') {
    templates.value = templateResult.value
    if (needsReload.value && editing.value?.id) {
      const saved = templates.value.find((row) => row.id === editing.value?.id)
      if (saved) edit(saved)
    }
  }
  if (venueResult.status === 'fulfilled') venues.value = venueResult.value
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') {
    loadError.value = failed.reason?.message || '無法載入固定範本或場地，請重新整理後再試。'
    ElMessage.error(loadError.value)
  } else if (needsReload.value) {
    loadError.value = '範本已儲存，尚未取得最新版本，請重新整理後繼續編輯。'
  }
  loading.value = false
}
watch(() => props.modelValue, (open) => {
  generation += 1
  if (!open) { loading.value = false; return }
  editing.value = null
  baseline.value = ''
  templates.value = []
  venues.value = []
  needsReload.value = false
  saveError.value = ''
  if (props.seed && props.canCreate) edit(props.seed)
  void load()
}, { immediate: true })
const save = async () => {
  if (!props.modelValue || !editing.value || !canSave.value || busy.value) return
  const template = editing.value
  errors.value = {
    venue: !template.venue_id && !template.venue_name.trim() ? '請選擇場地，或輸入新場地名稱。' : '',
    coaches: !template.coach_profile_ids.length ? '請至少選擇一位固定教練。' : ''
  }
  if (errors.value.venue || errors.value.coaches) {
    ElMessage.warning(errors.value.venue || errors.value.coaches)
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const id = await coachScheduleTemplatesApi.save({ ...template, name: template.name.trim(), venue_name: template.venue_name.trim() })
    editing.value = { ...template, id, updated_at: null }
    baseline.value = JSON.stringify(editing.value)
    needsReload.value = true
    ElMessage.success('固定範本已儲存')
    await load()
  } catch (error: any) {
    saveError.value = error?.message || '儲存固定範本失敗'
    ElMessage.error(saveError.value)
  } finally { saving.value = false }
}
const remove = async () => {
  if (!props.modelValue || !editing.value?.id || !props.canDelete || busy.value) return
  const template = templates.value.find((row) => row.id === editing.value?.id)
  if (!template) return
  try {
    await ElMessageBox.confirm(`刪除「${template.name}」？已儲存的排班不會被刪除。`, '刪除固定範本', {
      confirmButtonText: '刪除', cancelButtonText: '取消', type: 'warning'
    })
  } catch { return }
  if (!props.canDelete || busy.value || !props.modelValue || editing.value?.id !== template.id) return
  deleting.value = true
  saveError.value = ''
  try {
    await coachScheduleTemplatesApi.delete(template)
    editing.value = null
    baseline.value = ''
    await load()
    ElMessage.success('固定範本已刪除')
  } catch (error: any) {
    saveError.value = error?.message || '刪除固定範本失敗'
    ElMessage.error(saveError.value)
  } finally { deleting.value = false }
}
const close = async (done?: () => void) => {
  if (saving.value || deleting.value || !await confirmDiscard() || saving.value || deleting.value) return
  generation += 1
  if (done) done()
  else emit('update:modelValue', false)
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="固定排班範本" class="coach-template-manager-dialog coach-feature-theme" width="92%" style="max-width: 760px" :before-close="close"
    @update:model-value="emit('update:modelValue', $event)">
    <p class="mb-4 text-sm leading-relaxed text-slate-600">選擇場地與固定教練，即可套用到同場地的訓練活動。可直接新增，或從活動卡片的「更多」存成範本；到「自動帶入」預覽，確認後才會寫入排班。</p>
    <div class="mb-4 flex flex-wrap justify-end gap-2">
      <el-button v-if="loadError" plain class="!min-h-11" :disabled="busy" data-test="reload-templates" @click="load">重新整理</el-button>
      <el-button v-if="canCreate" type="primary" plain class="!min-h-11" :disabled="busy" data-test="create-template" @click="create">新增範本</el-button>
    </div>
    <p v-if="loadError" class="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800" role="alert" data-test="template-load-error">{{ loadError }}</p>
    <AppLoadingState v-if="loading" text="讀取固定範本與場地中..." min-height="120px" />
    <div v-else class="grid min-w-0 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <div class="flex min-w-0 flex-col gap-2">
        <p v-if="!templates.length && !loadError" class="text-sm text-slate-500">尚未建立固定範本。</p>
        <button v-for="template in templates" :key="template.id" type="button" class="min-h-11 rounded-xl border p-3 text-left text-sm"
          :class="editing?.id === template.id ? 'border-primary bg-amber-50' : 'border-slate-200'" :disabled="saving || deleting"
          data-test="template-list-item" @click="selectTemplate(template)">
          <span class="block break-words font-bold">{{ template.name }}</span>
          <span class="mt-1 block break-words text-slate-600">{{ template.venue_name }}{{ template.venue_is_active ? '' : '（場地停用）' }}</span>
          <span class="mt-1 block break-words text-xs text-slate-500">{{ coachNames(template.coach_profile_ids) }}・{{ template.is_active ? '啟用' : '停用' }}</span>
        </button>
      </div>
      <el-form v-if="editing" label-position="top" class="grid min-w-0 gap-3" :disabled="!canSave || busy">
        <el-form-item label="場地" required :error="errors.venue" class="mb-0">
          <el-select :model-value="venueSelection" filterable allow-create default-first-option :reserve-keyword="false" clearable size="large" class="!w-full"
            placeholder="選擇場地，或輸入新場地名稱" data-test="template-venue-select" @update:model-value="setVenue">
            <el-option v-for="venue in venueOptions" :key="venue.id" :value="venue.id" :label="venue.name" />
          </el-select>
          <p class="mt-2 text-sm leading-relaxed text-slate-500">可選擇全部啟用場地；輸入的新場地會在儲存範本時一併建立。</p>
        </el-form-item>
        <el-form-item label="固定教練" required :error="errors.coaches" class="mb-0">
          <el-select :model-value="editing.coach_profile_ids" multiple filterable :reserve-keyword="false" class="!w-full" size="large" placeholder="選擇固定教練"
            data-test="template-coaches-select" @update:model-value="setField('coach_profile_ids', $event)">
            <el-option-group v-for="group in coachGroups" :key="group.key" :label="group.label" data-test="template-coach-role-group">
              <el-option v-for="coach in group.coaches" :key="coach.id" :label="coach.nickname || coach.name" :value="coach.id" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item label="範本名稱（選填）" class="mb-0">
          <el-input :model-value="editing.name" maxlength="80" size="large" placeholder="未填寫時使用場地名稱" data-test="template-name-input" @update:model-value="setField('name', $event)" />
        </el-form-item>
        <el-form-item label="啟用範本" class="mb-0">
          <el-switch :model-value="editing.is_active" aria-label="啟用範本" data-test="template-enabled-switch" @update:model-value="setField('is_active', $event)" />
        </el-form-item>
        <p v-if="saveError" class="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert" data-test="template-save-error">{{ saveError }}</p>
      </el-form>
      <p v-else class="text-sm text-slate-500">{{ canCreate ? '選擇既有範本，或按「新增範本」建立。' : '選擇範本查看或修改設定。' }}</p>
    </div>
    <template #footer>
      <AppDialogFooter cancel-label="關閉" :confirm-label="editing ? '儲存範本' : '關閉'" :show-cancel="Boolean(editing)"
        :loading="saving" :confirm-disabled="busy || Boolean(editing && !canSave)" @cancel="close()" @confirm="editing ? save() : close()">
        <template #leading><el-button v-if="editing?.id && canDelete" type="danger" plain class="!min-h-11" :loading="deleting" :disabled="loading || saving" data-test="delete-template" @click="remove">刪除範本</el-button></template>
      </AppDialogFooter>
    </template>
  </el-dialog>
</template>

<style>
@media (max-width: 767px) {
  .coach-template-manager-dialog :is(.el-input__wrapper, .el-select__wrapper, .el-switch) { min-height: 44px !important; }
  .coach-template-manager-dialog .el-switch { min-width: 44px !important; }
  .coach-template-manager-dialog :is(.el-input__inner, .el-select__input) { font-size: 16px; }
}
</style>
