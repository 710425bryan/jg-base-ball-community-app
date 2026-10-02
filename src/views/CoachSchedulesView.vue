<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Calendar, MoreFilled, Plus } from '@element-plus/icons-vue'
import CoachScheduleEventEditor from '@/components/coach-schedules/CoachScheduleEventEditor.vue'
import CoachScheduleManualDialog from '@/components/coach-schedules/CoachScheduleManualDialog.vue'
import CoachScheduleTemplateManager from '@/components/coach-schedules/CoachScheduleTemplateManager.vue'
import CoachScheduleAutoFillPreview from '@/components/coach-schedules/CoachScheduleAutoFillPreview.vue'
import CoachScheduleMonthOverview from '@/components/coach-schedules/CoachScheduleMonthOverview.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import { useCoachScheduleEditor } from '@/composables/useCoachScheduleEditor'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { useForegroundRefresh } from '@/composables/useForegroundRefresh'
import { usePermissionsStore } from '@/stores/permissions'
import { coachSchedulesApi } from '@/services/coachSchedulesApi'
import type { CoachScheduleEvent, CoachScheduleSourceType } from '@/types/coachSchedule'
import type { CoachScheduleTemplateInput } from '@/types/coachScheduleTemplate'
import {
  COACH_SCHEDULE_SOURCE_LABELS, formatCoachScheduleMonthLabel, getCoachScheduleEventKey,
  getCoachScheduleMonthStart, normalizeCoachScheduleMonth, prioritizeCoachScheduleEventsByToday
} from '@/utils/coachSchedules'
import { canCopyCoachScheduleTemplate, copyCoachScheduleTemplate } from '@/utils/coachScheduleTemplates'
import '@/components/coach-schedules/coachFeatureTheme.css'

type SourceFilter = 'all' | CoachScheduleSourceType
const route = useRoute()
const router = useRouter()
const permissionsStore = usePermissionsStore()
const canCreate = computed(() => permissionsStore.can('coach_schedules', 'CREATE'))
const canEdit = computed(() => permissionsStore.can('coach_schedules', 'EDIT'))
const canDelete = computed(() => permissionsStore.can('coach_schedules', 'DELETE'))
const selectedMonth = ref(normalizeCoachScheduleMonth(typeof route.query.month === 'string' ? route.query.month : null))
const sourceFilter = ref<SourceFilter>('all')
const onlyUnassigned = ref(false)
const isManualDialogOpen = ref(false)
const isTemplateManagerOpen = ref(false)
const isAutoFillOpen = ref(false)
const isMonthOverviewOpen = ref(false)
const overviewEvents = ref<CoachScheduleEvent[]>([])
const overviewLoading = ref(false)
const overviewError = ref('')
let overviewGeneration = 0
const templateSeed = ref<CoachScheduleTemplateInput | null>(null)
const {
  coaches, events, eventForms, savingKeys, deletingIds, isLoading, isCoachLoading,
  getEventForm, isDirty, confirmDiscard, loadMonth, loadCoaches, saveEvent, deleteEvent, reload
} = useCoachScheduleEditor(selectedMonth, { canCreate, canEdit, canDelete },
  () => isManualDialogOpen.value || isTemplateManagerOpen.value || isAutoFillOpen.value || isMonthOverviewOpen.value)
useUnsavedChangesGuard({ isDirty, confirmDiscard })

const sourceFilters = computed(() => {
  const counts = events.value.reduce<Record<string, number>>((summary, event) => {
    summary[event.source_type] = (summary[event.source_type] || 0) + 1
    return summary
  }, {})
  return [
    { key: 'all' as SourceFilter, label: '全部', count: events.value.length },
    ...Object.entries(COACH_SCHEDULE_SOURCE_LABELS).map(([key, label]) => ({
      key: key as SourceFilter, label, count: counts[key] || 0
    }))
  ].filter((item) => item.key === 'all' || item.count > 0)
})
const sourceEvents = computed(() => sourceFilter.value === 'all'
  ? events.value : events.value.filter((event) => event.source_type === sourceFilter.value))
const unassignedEventCount = computed(() => sourceEvents.value.filter((event) => event.coach_profile_ids.length === 0).length)
const visibleEvents = computed(() => prioritizeCoachScheduleEventsByToday(onlyUnassigned.value
  ? sourceEvents.value.filter((event) => event.coach_profile_ids.length === 0) : sourceEvents.value))
const monthLabel = computed(() => formatCoachScheduleMonthLabel(getCoachScheduleMonthStart(selectedMonth.value)))
const emptyMessage = computed(() => !events.value.length ? '這個月份目前沒有可排班活動。'
  : onlyUnassigned.value ? '目前篩選條件下沒有未指派教練的活動。' : '目前篩選條件下沒有活動。')

const syncMonthQuery = () => {
  if (route.query.month !== selectedMonth.value) void router.replace({ query: { ...route.query, month: selectedMonth.value } })
}
const changeMonth = async (value: string | null) => {
  if (!value || normalizeCoachScheduleMonth(value) === selectedMonth.value || !await confirmDiscard()) return
  selectedMonth.value = normalizeCoachScheduleMonth(value)
  syncMonthQuery()
  await loadMonth()
}
watch(() => route.query.month, async (value) => {
  if (typeof value !== 'string' || normalizeCoachScheduleMonth(value) === selectedMonth.value) return
  if (!await confirmDiscard()) { syncMonthQuery(); return }
  selectedMonth.value = normalizeCoachScheduleMonth(value)
  await loadMonth()
})
const copyTemplate = (event: CoachScheduleEvent) => {
  if (!canCreate.value || !canCopyCoachScheduleTemplate(event)) return
  templateSeed.value = copyCoachScheduleTemplate({ ...event, coach_profile_ids: [...getEventForm(event).coachProfileIds] })
  isTemplateManagerOpen.value = true
}
const openTemplates = () => { templateSeed.value = null; isTemplateManagerOpen.value = true }
const openAutoFill = async () => {
  if (!await confirmDiscard()) return
  if (isDirty.value) await loadMonth()
  isAutoFillOpen.value = true
}
const handleCommand = (command: string) => {
  if (command === 'templates') openTemplates()
  else if (command === 'manual') isManualDialogOpen.value = true
  else if (command === 'refresh') void reload()
}
const loadOverview = async () => {
  if (!isMonthOverviewOpen.value || overviewLoading.value) return
  const request = ++overviewGeneration
  const month = selectedMonth.value
  overviewLoading.value = true
  overviewError.value = ''
  overviewEvents.value = []
  try {
    const snapshot = await coachSchedulesApi.listAdminMonth(month)
    if (request !== overviewGeneration || !isMonthOverviewOpen.value || selectedMonth.value !== month) return
    overviewEvents.value = snapshot.events
  } catch (error: any) {
    if (request !== overviewGeneration || !isMonthOverviewOpen.value || selectedMonth.value !== month) return
    overviewError.value = error?.message || '無法載入月份總覽，請重新整理後再試。'
  } finally { if (request === overviewGeneration) overviewLoading.value = false }
}
watch([isMonthOverviewOpen, selectedMonth], ([open]) => {
  overviewGeneration += 1
  overviewEvents.value = []
  overviewError.value = ''
  overviewLoading.value = false
  if (open) void loadOverview()
})
useForegroundRefresh(loadOverview, ['coach-leave-changed'])
onBeforeUnmount(() => { overviewGeneration += 1 })
onMounted(async () => { await Promise.all([permissionsStore.fetchRoles(), loadCoaches(), loadMonth()]) })
</script>

<template>
  <div class="coach-feature-theme min-h-full min-w-0 bg-background p-2 pb-5 text-text md:p-6">
    <div class="mx-auto flex max-w-7xl flex-col gap-4">
      <AppPageHeader title="教練排班表" subtitle="設定場地與固定教練，自動帶入訓練排班，並排除已請假的教練。" :icon="Calendar" as="h2">
        <template #title-suffix><span class="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{{ monthLabel }}</span></template>
        <template #actions>
          <el-dropdown trigger="click" @command="handleCommand">
            <el-button class="!min-h-11"><el-icon><MoreFilled /></el-icon>更多</el-button>
            <template #dropdown><el-dropdown-menu>
              <el-dropdown-item command="refresh" :disabled="isLoading">重新整理</el-dropdown-item>
              <el-dropdown-item command="templates">固定範本</el-dropdown-item>
              <el-dropdown-item v-if="canCreate" command="manual">新增手動排班</el-dropdown-item>
            </el-dropdown-menu></template>
          </el-dropdown>
          <el-button v-if="canCreate || canEdit" type="primary" class="!min-h-11" :disabled="isLoading" @click="openAutoFill">
            <el-icon><Plus /></el-icon>自動帶入
          </el-button>
        </template>
      </AppPageHeader>
      <section class="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-[220px_minmax(0,1fr)] md:items-end">
        <div class="grid min-w-0 gap-3">
          <el-form-item label="排班月份" class="mb-0 font-bold">
            <el-date-picker :model-value="selectedMonth" type="month" value-format="YYYY-MM" format="YYYY 年 M 月" class="!w-full" size="large" :clearable="false" :disabled="isLoading" @update:model-value="changeMonth" />
          </el-form-item>
          <el-button class="!min-h-11 !w-full" :disabled="isLoading" data-test="open-month-overview" @click="isMonthOverviewOpen = true">月份總覽</el-button>
        </div>
        <div class="flex min-w-0 flex-wrap items-center gap-3">
          <div class="flex flex-wrap gap-2">
            <button v-for="filter in sourceFilters" :key="filter.key" type="button" class="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold"
              :class="sourceFilter === filter.key ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-slate-50 text-slate-600'"
              :aria-pressed="sourceFilter === filter.key" @click="sourceFilter = filter.key">
              {{ filter.label }}<span class="rounded-full bg-white/70 px-2 py-0.5 text-xs" :class="sourceFilter === filter.key ? 'text-primary' : 'text-slate-500'">{{ filter.count }}</span>
            </button>
          </div>
          <button type="button" class="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold" data-test="filter-unassigned"
            :class="onlyUnassigned ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-slate-50 text-slate-600'"
            :aria-pressed="onlyUnassigned" @click="onlyUnassigned = !onlyUnassigned">
            未指派教練<span class="rounded-full bg-white/70 px-2 py-0.5 text-xs" :class="onlyUnassigned ? 'text-primary' : 'text-slate-500'">{{ unassignedEventCount }}</span>
          </button>
        </div>
      </section>
      <p v-if="isDirty" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">有未儲存的變更。切回頁面時保留編輯，儲存前會再次確認最新排班及請假狀態。</p>
      <AppLoadingState v-if="isLoading" text="讀取教練排班中..." min-height="50vh" />
      <section v-else class="grid gap-3">
        <div v-if="!visibleEvents.length" class="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">{{ emptyMessage }}</div>
        <CoachScheduleEventEditor v-for="event in visibleEvents" :key="getCoachScheduleEventKey(event)" :event="event" :form="getEventForm(event)"
          :coaches="coaches" :can-create="canCreate" :can-edit="canEdit" :can-delete="canDelete" :saving="savingKeys.has(getCoachScheduleEventKey(event))"
          :deleting="Boolean(event.id && deletingIds.has(event.id))" :coach-loading="isCoachLoading"
          @update:form="eventForms[getCoachScheduleEventKey(event)] = $event" @save="saveEvent(event)" @delete="deleteEvent(event)" @copy-template="copyTemplate(event)" />
      </section>
    </div>
    <CoachScheduleManualDialog v-model="isManualDialogOpen" :month="selectedMonth" :coaches="coaches" :can-create="canCreate" @saved="loadMonth(true)" />
    <CoachScheduleTemplateManager v-model="isTemplateManagerOpen" :seed="templateSeed" :coaches="coaches" :can-create="canCreate" :can-edit="canEdit" :can-delete="canDelete" />
    <CoachScheduleAutoFillPreview v-model="isAutoFillOpen" :month="selectedMonth" :coaches="coaches" :can-create="canCreate" :can-edit="canEdit" @saved="loadMonth()" />
    <CoachScheduleMonthOverview v-model="isMonthOverviewOpen" :month="selectedMonth" :events="overviewEvents" :has-unsaved-changes="isDirty"
      :loading="overviewLoading" :error="overviewError" @refresh="loadOverview" />
  </div>
</template>
