<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { Calendar, Clock, Location, UserFilled } from '@element-plus/icons-vue'
import type { CoachScheduleEvent, CoachScheduleMonthPayload, CoachScheduleSourceType } from '@/types/coachSchedule'
import {
  formatCoachScheduleDateLabel,
  formatCoachScheduleMonthLabel,
  formatCoachScheduleTimeRange,
  getCoachScheduleDisplayCoachNames,
  getCoachScheduleSourceLabel
} from '@/utils/coachSchedules'

const props = defineProps<{
  payload: CoachScheduleMonthPayload | null
  isLoading?: boolean
  canManage?: boolean
}>()

const events = computed(() => props.payload?.events ?? [])
const isAllScope = computed(() => props.payload?.scope === 'all' || props.payload?.scope === 'admin')
const monthLabel = computed(() =>
  props.payload?.month_start ? formatCoachScheduleMonthLabel(props.payload.month_start) : '本月'
)
const panelSubtitle = computed(() =>
  isAllScope.value ? '所有教練本月排班' : '我的本月上課日'
)
const prioritizedEvents = computed(() => {
  const today = dayjs().startOf('day')

  return [...events.value].sort((a, b) => {
    const aDay = dayjs(a.schedule_date).startOf('day')
    const bDay = dayjs(b.schedule_date).startOf('day')
    const aDiff = aDay.diff(today, 'day')
    const bDiff = bDay.diff(today, 'day')
    const aUpcoming = aDiff >= 0
    const bUpcoming = bDiff >= 0

    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1

    const dateDiff = aUpcoming
      ? aDay.valueOf() - bDay.valueOf()
      : bDay.valueOf() - aDay.valueOf()
    if (dateDiff !== 0) return dateDiff

    return (a.start_time || '23:59').localeCompare(b.start_time || '23:59')
  })
})
const displayedEvents = computed(() => prioritizedEvents.value.slice(0, 6))
const hiddenEventCount = computed(() => Math.max(0, prioritizedEvents.value.length - displayedEvents.value.length))

const getSourceClass = (sourceType: CoachScheduleSourceType) => {
  if (sourceType === 'training_location') return 'bg-blue-50 text-blue-700'
  if (sourceType === 'training_class') return 'bg-violet-50 text-violet-700'
  if (sourceType === 'training_date') return 'bg-emerald-50 text-emerald-700'
  if (sourceType === 'match') return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

const getEventDayDiff = (event: CoachScheduleEvent) =>
  dayjs(event.schedule_date).startOf('day').diff(dayjs().startOf('day'), 'day')

const getEventCardClass = (event: CoachScheduleEvent) => {
  const diffDays = getEventDayDiff(event)

  if (diffDays === 0) {
    return 'border-primary/40 bg-primary/10 shadow-sm'
  }

  if (diffDays > 0 && diffDays <= 7) {
    return 'border-amber-200 bg-amber-50/80 shadow-sm'
  }

  return 'border-slate-100 bg-white'
}

const getEventDateHint = (event: CoachScheduleEvent) => {
  const diffDays = getEventDayDiff(event)

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '明天'
  if (diffDays > 1 && diffDays <= 7) return `${diffDays} 天後`
  return ''
}
</script>

<template>
  <section data-test="coach-schedule-dashboard" class="mx-auto mt-6 w-full max-w-7xl px-3 sm:px-4">
    <div class="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div class="flex flex-col gap-2 border-b border-slate-100 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div class="flex min-w-0 items-center gap-2.5">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
            <el-icon class="text-base"><UserFilled /></el-icon>
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-black text-slate-900">教練排班</h2>
              <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-600">
                {{ monthLabel }}
              </span>
              <span class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
                {{ isAllScope ? '全體教練' : '我的排班' }}
              </span>
            </div>
            <p class="mt-0.5 text-xs font-bold text-slate-500">{{ panelSubtitle }}</p>
          </div>
        </div>

        <router-link
          v-if="canManage"
          to="/coach-schedules"
          class="inline-flex min-h-8 min-w-[5.75rem] shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-slate-900 px-4 text-sm font-black text-white transition-colors hover:bg-slate-800"
        >
          管理排班
        </router-link>
      </div>

      <div v-if="isLoading" class="px-4 py-6 text-center text-sm font-bold text-slate-400">
        讀取教練排班中...
      </div>

      <div v-else-if="events.length === 0" class="px-4 py-6 text-center text-sm font-bold text-slate-400">
        本月尚無教練排班。
      </div>

      <div v-else class="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="event in displayedEvents"
          :key="event.id || `${event.source_type}-${event.schedule_date}-${event.title}`"
          class="flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-2.5"
          :class="getEventCardClass(event)"
          data-test="coach-schedule-dashboard-item"
        >
          <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <div class="flex items-center gap-1.5 text-sm font-black text-slate-800">
              <el-icon class="text-primary"><Calendar /></el-icon>
              <span>{{ formatCoachScheduleDateLabel(event.schedule_date) }}</span>
            </div>
            <div class="flex items-center gap-1.5 text-sm font-bold text-slate-600">
              <el-icon class="text-primary"><Clock /></el-icon>
              <span>{{ formatCoachScheduleTimeRange(event) }}</span>
            </div>
            <span
              v-if="getEventDateHint(event)"
              class="rounded-full bg-white/80 px-2 py-0.5 text-xs font-black text-primary ring-1 ring-primary/20"
            >
              {{ getEventDateHint(event) }}
            </span>
          </div>

          <div class="min-w-0">
            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
              <span class="rounded-full px-2 py-0.5 text-xs font-black" :class="getSourceClass(event.source_type)">
                {{ getCoachScheduleSourceLabel(event.source_type) }}
              </span>
              <span v-if="event.status === 'cancelled'" class="rounded-full bg-red-50 px-2 py-0.5 text-xs font-black text-red-700">
                已取消
              </span>
            </div>
            <h3 class="mt-1 truncate text-sm font-black text-slate-900">{{ event.title }}</h3>
            <div class="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-500">
              <el-icon class="text-primary"><Location /></el-icon>
              <span class="truncate">{{ event.location || '地點未定' }}</span>
            </div>
          </div>

          <div class="mt-auto flex min-w-0 flex-wrap gap-1.5">
            <span
              v-for="name in getCoachScheduleDisplayCoachNames(event)"
              :key="name"
              class="rounded-lg bg-white/90 px-2 py-0.5 text-xs font-black text-slate-700 ring-1 ring-slate-200"
            >
              {{ name }}
            </span>
            <span v-if="getCoachScheduleDisplayCoachNames(event).length === 0" class="text-xs font-bold text-slate-400">
              尚未指派教練
            </span>
          </div>
        </article>

        <div v-if="hiddenEventCount > 0" class="flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between xl:col-span-3">
          <span>另有 {{ hiddenEventCount }} 筆排班未顯示。</span>
          <router-link
            v-if="canManage"
            to="/coach-schedules"
            class="text-primary transition-colors hover:text-primary-hover"
          >
            前往管理排班查看
          </router-link>
        </div>
      </div>
    </div>
  </section>
</template>
