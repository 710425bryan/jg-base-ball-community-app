<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Calendar,
  Check,
  Clock,
  Delete,
  Location,
  Plus,
  Refresh,
  UserFilled
} from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import { coachSchedulesApi } from '@/services/coachSchedulesApi'
import { usePermissionsStore } from '@/stores/permissions'
import type {
  CoachScheduleEvent,
  CoachScheduleSaveInput,
  CoachScheduleSourceType,
  CoachScheduleStatus,
  SchedulableCoach
} from '@/types/coachSchedule'
import {
  COACH_SCHEDULE_SOURCE_LABELS,
  formatCoachScheduleDateLabel,
  formatCoachScheduleMonthLabel,
  formatCoachScheduleTimeRange,
  getCoachScheduleEventKey,
  getCoachScheduleMonthStart,
  getCoachScheduleSourceLabel,
  normalizeCoachScheduleMonth,
  prioritizeCoachScheduleEventsByToday
} from '@/utils/coachSchedules'

type SourceFilter = 'all' | CoachScheduleSourceType

type EventFormState = {
  coachProfileIds: string[]
  status: CoachScheduleStatus
  note: string
}

const route = useRoute()
const router = useRouter()
const permissionsStore = usePermissionsStore()

const canCreate = computed(() => permissionsStore.can('coach_schedules', 'CREATE'))
const canEdit = computed(() => permissionsStore.can('coach_schedules', 'EDIT'))
const canDelete = computed(() => permissionsStore.can('coach_schedules', 'DELETE'))

const selectedMonth = ref(normalizeCoachScheduleMonth(
  typeof route.query.month === 'string' ? route.query.month : null
))
const sourceFilter = ref<SourceFilter>('all')
const coaches = ref<SchedulableCoach[]>([])
const events = ref<CoachScheduleEvent[]>([])
const eventForms = reactive<Record<string, EventFormState>>({})
const savingKeys = ref<Set<string>>(new Set())
const deletingIds = ref<Set<string>>(new Set())
const isLoading = ref(false)
const isCoachLoading = ref(false)
const isManualDialogOpen = ref(false)
const isSavingManual = ref(false)

const manualForm = reactive({
  title: '',
  schedule_date: dayjs().format('YYYY-MM-DD'),
  timeRange: [] as string[],
  location: '',
  note: '',
  coachProfileIds: [] as string[]
})

const sourceFilters = computed<Array<{ key: SourceFilter; label: string; count: number }>>(() => {
  const counts = events.value.reduce<Record<string, number>>((summary, event) => {
    summary[event.source_type] = (summary[event.source_type] || 0) + 1
    return summary
  }, {})

  const filters: Array<{ key: SourceFilter; label: string; count: number }> = [
    { key: 'all', label: '全部', count: events.value.length },
    ...Object.entries(COACH_SCHEDULE_SOURCE_LABELS).map(([key, label]) => ({
      key: key as CoachScheduleSourceType,
      label,
      count: counts[key] || 0
    }))
  ]

  return filters.filter((item) => item.key === 'all' || item.count > 0)
})

const visibleEvents = computed(() => {
  const filtered = sourceFilter.value === 'all'
    ? events.value
    : events.value.filter((event) => event.source_type === sourceFilter.value)

  return prioritizeCoachScheduleEventsByToday(filtered)
})

const monthLabel = computed(() => formatCoachScheduleMonthLabel(getCoachScheduleMonthStart(selectedMonth.value)))
const savedEventCount = computed(() => events.value.filter((event) => event.is_persisted).length)
const assignedEventCount = computed(() => events.value.filter((event) => event.coach_profile_ids.length > 0).length)

const coachDisplayName = (coach: SchedulableCoach) =>
  coach.nickname || coach.name || '未命名教練'

const coachNameMap = computed(() =>
  new Map(coaches.value.map((coach) => [coach.id, coachDisplayName(coach)]))
)

const getSourcePillClass = (sourceType: CoachScheduleSourceType) => {
  if (sourceType === 'training_location') return 'bg-blue-50 text-blue-700 ring-blue-100'
  if (sourceType === 'training_class') return 'bg-violet-50 text-violet-700 ring-violet-100'
  if (sourceType === 'training_date') return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  if (sourceType === 'match') return 'bg-amber-50 text-amber-700 ring-amber-100'
  return 'bg-slate-100 text-slate-600 ring-slate-200'
}

const getEventForm = (event: CoachScheduleEvent) => {
  const key = getCoachScheduleEventKey(event)
  if (!eventForms[key]) {
    eventForms[key] = {
      coachProfileIds: [...event.coach_profile_ids],
      status: event.status,
      note: event.note || ''
    }
  }
  return eventForms[key]
}

const getAssignedCoachNames = (event: CoachScheduleEvent) => {
  const form = getEventForm(event)
  return form.coachProfileIds
    .map((coachId) => {
      const coachName = coachNameMap.value.get(coachId)
      if (coachName) return coachName

      const assignment = event.assignments.find((item) => item.coach_profile_id === coachId)
      return assignment?.coach_nickname || assignment?.coach_name || coachId
    })
    .filter(Boolean)
}

const setSaving = (key: string, value: boolean) => {
  const next = new Set(savingKeys.value)
  if (value) next.add(key)
  else next.delete(key)
  savingKeys.value = next
}

const setDeleting = (id: string, value: boolean) => {
  const next = new Set(deletingIds.value)
  if (value) next.add(id)
  else next.delete(id)
  deletingIds.value = next
}

const resetEventForms = () => {
  Object.keys(eventForms).forEach((key) => {
    delete eventForms[key]
  })

  events.value.forEach((event) => {
    const key = getCoachScheduleEventKey(event)
    eventForms[key] = {
      coachProfileIds: [...event.coach_profile_ids],
      status: event.status,
      note: event.note || ''
    }
  })
}

const loadCoaches = async () => {
  isCoachLoading.value = true
  try {
    coaches.value = await coachSchedulesApi.listSchedulableCoaches()
  } catch (error: any) {
    console.error('Error loading schedulable coaches:', error)
    coaches.value = []
    ElMessage.error(error?.message || '無法載入可排班教練')
  } finally {
    isCoachLoading.value = false
  }
}

const loadMonth = async () => {
  isLoading.value = true
  try {
    const payload = await coachSchedulesApi.listAdminMonth(selectedMonth.value)
    events.value = payload.events
    resetEventForms()
  } catch (error: any) {
    console.error('Error loading coach schedules:', error)
    events.value = []
    resetEventForms()
    ElMessage.error(error?.message || '無法載入教練排班')
  } finally {
    isLoading.value = false
  }
}

const buildSaveInput = (event: CoachScheduleEvent): CoachScheduleSaveInput => {
  const form = getEventForm(event)
  return {
    id: event.id,
    source_type: event.source_type,
    source_id: event.source_id,
    source_venue_id: event.source_venue_id,
    schedule_date: event.schedule_date,
    start_time: event.start_time,
    end_time: event.end_time,
    title: event.title,
    location: event.location,
    location_url: event.location_url,
    legacy_coaches: event.legacy_coaches,
    status: form.status,
    note: form.note,
    coach_profile_ids: form.coachProfileIds
  }
}

const saveEvent = async (event: CoachScheduleEvent) => {
  if (event.is_persisted ? !canEdit.value : !canCreate.value) {
    ElMessage.warning(event.is_persisted ? '需要教練排班編輯權限' : '需要教練排班新增權限')
    return
  }

  const key = getCoachScheduleEventKey(event)
  setSaving(key, true)

  try {
    await coachSchedulesApi.saveEvent(buildSaveInput(event))
    ElMessage.success('教練排班已儲存')
    await loadMonth()
  } catch (error: any) {
    console.error('Error saving coach schedule:', error)
    ElMessage.error(error?.message || '儲存教練排班失敗')
  } finally {
    setSaving(key, false)
  }
}

const deleteEvent = async (event: CoachScheduleEvent) => {
  if (!event.id || !canDelete.value) return

  try {
    await ElMessageBox.confirm(
      `確定刪除「${event.title}」的教練排班？候選活動仍會保留，可重新指定教練。`,
      '刪除教練排班',
      {
        type: 'warning',
        confirmButtonText: '刪除',
        cancelButtonText: '取消'
      }
    )
  } catch {
    return
  }

  setDeleting(event.id, true)
  try {
    await coachSchedulesApi.deleteEvent(event.id)
    ElMessage.success('教練排班已刪除')
    await loadMonth()
  } catch (error: any) {
    console.error('Error deleting coach schedule:', error)
    ElMessage.error(error?.message || '刪除教練排班失敗')
  } finally {
    setDeleting(event.id, false)
  }
}

const openManualDialog = () => {
  manualForm.title = ''
  manualForm.schedule_date = `${selectedMonth.value}-01`
  manualForm.timeRange = []
  manualForm.location = ''
  manualForm.note = ''
  manualForm.coachProfileIds = []
  isManualDialogOpen.value = true
}

const saveManualEvent = async () => {
  if (!canCreate.value) return
  if (!manualForm.title.trim()) {
    ElMessage.warning('請輸入排班標題')
    return
  }

  isSavingManual.value = true
  try {
    await coachSchedulesApi.saveEvent({
      source_type: 'manual',
      schedule_date: manualForm.schedule_date,
      start_time: manualForm.timeRange[0] || null,
      end_time: manualForm.timeRange[1] || null,
      title: manualForm.title.trim(),
      location: manualForm.location.trim() || null,
      note: manualForm.note.trim() || null,
      status: 'scheduled',
      coach_profile_ids: manualForm.coachProfileIds
    })
    ElMessage.success('手動排班已新增')
    isManualDialogOpen.value = false
    await loadMonth()
  } catch (error: any) {
    console.error('Error saving manual coach schedule:', error)
    ElMessage.error(error?.message || '新增手動排班失敗')
  } finally {
    isSavingManual.value = false
  }
}

const syncMonthQuery = () => {
  if (route.query.month === selectedMonth.value) return
  void router.replace({
    query: {
      ...route.query,
      month: selectedMonth.value
    }
  })
}

watch(selectedMonth, () => {
  syncMonthQuery()
  void loadMonth()
})

watch(
  () => route.query.month,
  (month) => {
    if (typeof month !== 'string') return
    const normalized = normalizeCoachScheduleMonth(month)
    if (normalized !== selectedMonth.value) {
      selectedMonth.value = normalized
    }
  }
)

onMounted(async () => {
  await Promise.all([loadCoaches(), loadMonth()])
})
</script>

<template>
  <div class="min-h-full min-w-0 bg-background p-2 pb-5 text-text md:p-6">
    <div class="mx-auto flex max-w-7xl flex-col gap-4">
      <AppPageHeader
        title="教練排班表"
        subtitle="依訓練日期、場地訓練、比賽與特訓課指定教練上課日。"
        :icon="Calendar"
        as="h2"
      >
        <template #title-suffix>
          <span class="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
            {{ monthLabel }}
          </span>
        </template>
        <template #actions>
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition-colors hover:border-primary hover:text-primary"
            :disabled="isLoading"
            @click="loadMonth"
          >
            <el-icon :class="{ 'is-loading': isLoading }"><Refresh /></el-icon>
            重新整理
          </button>
          <button
            v-if="canCreate"
            type="button"
            class="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white shadow-md transition-colors hover:bg-primary-hover"
            @click="openManualDialog"
          >
            <el-icon><Plus /></el-icon>
            新增排班
          </button>
        </template>
      </AppPageHeader>

      <section class="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-[220px_minmax(0,1fr)] md:items-end">
        <el-form-item label="排班月份" class="mb-0 font-bold">
          <el-date-picker
            v-model="selectedMonth"
            type="month"
            value-format="YYYY-MM"
            format="YYYY 年 M 月"
            class="!w-full"
            size="large"
          />
        </el-form-item>

        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="filter in sourceFilters"
              :key="filter.key"
              type="button"
              class="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-black transition-colors"
              :class="sourceFilter === filter.key ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary hover:text-primary'"
              :aria-pressed="sourceFilter === filter.key"
              @click="sourceFilter = filter.key"
            >
              {{ filter.label }}
              <span class="rounded-full bg-white/70 px-2 py-0.5 text-xs" :class="sourceFilter === filter.key ? 'text-primary' : 'text-slate-500'">
                {{ filter.count }}
              </span>
            </button>
          </div>

          <div class="grid gap-2 text-sm font-bold text-slate-500 sm:grid-cols-3">
            <div class="rounded-xl bg-slate-50 px-3 py-2">
              候選活動 <span class="text-slate-900">{{ events.length }}</span>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-2">
              已儲存 <span class="text-slate-900">{{ savedEventCount }}</span>
            </div>
            <div class="rounded-xl bg-slate-50 px-3 py-2">
              已指派教練 <span class="text-slate-900">{{ assignedEventCount }}</span>
            </div>
          </div>
        </div>
      </section>

      <AppLoadingState v-if="isLoading" text="讀取教練排班中..." min-height="50vh" />

      <section v-else class="grid gap-3">
        <div v-if="visibleEvents.length === 0" class="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm font-bold text-slate-400">
          這個月份目前沒有可排班活動。
        </div>

        <article
          v-for="event in visibleEvents"
          :key="getCoachScheduleEventKey(event)"
          class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:p-5"
          data-test="coach-schedule-event"
        >
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-full px-3 py-1 text-xs font-black ring-1" :class="getSourcePillClass(event.source_type)">
                  {{ getCoachScheduleSourceLabel(event.source_type) }}
                </span>
                <span v-if="event.is_persisted" class="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-100">已儲存</span>
                <span v-if="event.status === 'cancelled'" class="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700 ring-1 ring-red-100">已取消</span>
              </div>

              <h3 class="mt-3 truncate text-lg font-black text-slate-900 md:text-xl">{{ event.title }}</h3>

              <div class="mt-3 grid gap-2 text-sm font-bold text-slate-500 sm:grid-cols-2">
                <div class="flex min-w-0 items-center gap-2">
                  <el-icon class="text-primary"><Calendar /></el-icon>
                  <span>{{ formatCoachScheduleDateLabel(event.schedule_date) }}</span>
                </div>
                <div class="flex min-w-0 items-center gap-2">
                  <el-icon class="text-primary"><Clock /></el-icon>
                  <span>{{ formatCoachScheduleTimeRange(event) }}</span>
                </div>
                <div class="flex min-w-0 items-center gap-2 sm:col-span-2">
                  <el-icon class="text-primary"><Location /></el-icon>
                  <a
                    v-if="event.location_url"
                    :href="event.location_url"
                    target="_blank"
                    rel="noreferrer"
                    class="truncate text-primary hover:text-primary-hover"
                  >
                    {{ event.location || '查看地點' }}
                  </a>
                  <span v-else class="truncate">{{ event.location || '地點未定' }}</span>
                </div>
              </div>

              <div v-if="event.legacy_coaches" class="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-800">
                比賽原教練欄位：{{ event.legacy_coaches }}
              </div>

              <div v-if="getAssignedCoachNames(event).length > 0" class="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold leading-relaxed text-blue-800">
                已指派教練：{{ getAssignedCoachNames(event).join('、') }}
              </div>
            </div>

            <div class="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <el-form-item label="指派教練" class="mb-0 font-bold">
                <el-select
                  v-model="getEventForm(event).coachProfileIds"
                  multiple
                  filterable
                  collapse-tags
                  collapse-tags-tooltip
                  :loading="isCoachLoading"
                  placeholder="選擇教練"
                  class="!w-full"
                  size="large"
                >
                  <el-option
                    v-for="coach in coaches"
                    :key="coach.id"
                    :label="coachDisplayName(coach)"
                    :value="coach.id"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span class="font-bold">{{ coachDisplayName(coach) }}</span>
                      <span class="text-xs text-slate-400">{{ coach.role === 'HEAD_COACH' ? '總教練' : '教練' }}</span>
                    </div>
                  </el-option>
                </el-select>
              </el-form-item>

              <div class="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <el-form-item label="狀態" class="mb-0 font-bold">
                  <el-select v-model="getEventForm(event).status" class="!w-full" size="large">
                    <el-option label="正常上課" value="scheduled" />
                    <el-option label="取消" value="cancelled" />
                  </el-select>
                </el-form-item>

                <el-form-item label="備註" class="mb-0 font-bold">
                  <el-input
                    v-model="getEventForm(event).note"
                    placeholder="例：投手分組、客場支援"
                    maxlength="120"
                    show-word-limit
                    size="large"
                  />
                </el-form-item>
              </div>

              <div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  v-if="event.is_persisted && canDelete"
                  type="button"
                  class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-black text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                  :disabled="Boolean(event.id && deletingIds.has(event.id))"
                  @click="deleteEvent(event)"
                >
                  <el-icon><Delete /></el-icon>
                  刪除
                </button>
                <button
                  v-if="event.is_persisted ? canEdit : canCreate"
                  type="button"
                  class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                  :disabled="savingKeys.has(getCoachScheduleEventKey(event))"
                  @click="saveEvent(event)"
                >
                  <el-icon><Check /></el-icon>
                  {{ event.is_persisted ? '更新排班' : '儲存排班' }}
                </button>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>

    <el-dialog v-model="isManualDialogOpen" title="新增手動排班" width="92%" style="max-width: 520px;">
      <el-form label-position="top" class="grid gap-3">
        <el-form-item label="標題" class="mb-0 font-bold">
          <el-input v-model="manualForm.title" placeholder="例：投捕加練" size="large" />
        </el-form-item>
        <div class="grid gap-3 sm:grid-cols-2">
          <el-form-item label="日期" class="mb-0 font-bold">
            <el-date-picker v-model="manualForm.schedule_date" type="date" value-format="YYYY-MM-DD" format="YYYY-MM-DD" class="!w-full" size="large" />
          </el-form-item>
          <el-form-item label="時間" class="mb-0 font-bold">
            <el-time-picker
              v-model="manualForm.timeRange"
              is-range
              range-separator="-"
              start-placeholder="開始"
              end-placeholder="結束"
              value-format="HH:mm"
              format="HH:mm"
              class="!w-full"
              size="large"
            />
          </el-form-item>
        </div>
        <el-form-item label="地點" class="mb-0 font-bold">
          <el-input v-model="manualForm.location" placeholder="例：中港國小" size="large" />
        </el-form-item>
        <el-form-item label="指派教練" class="mb-0 font-bold">
          <el-select
            v-model="manualForm.coachProfileIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="選擇教練"
            class="!w-full"
            size="large"
          >
            <el-option
              v-for="coach in coaches"
              :key="coach.id"
              :label="coachDisplayName(coach)"
              :value="coach.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="備註" class="mb-0 font-bold">
          <el-input v-model="manualForm.note" type="textarea" :rows="3" maxlength="160" show-word-limit />
        </el-form-item>
      </el-form>

      <template #footer>
        <AppDialogFooter
          confirm-label="新增"
          :loading="isSavingManual"
          @cancel="isManualDialogOpen = false"
          @confirm="saveManualEvent"
        />
      </template>
    </el-dialog>
  </div>
</template>
