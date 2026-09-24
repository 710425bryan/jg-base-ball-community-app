<script setup lang="ts">
import { Calendar, Clock, Location } from '@element-plus/icons-vue'
import type { CoachScheduleEvent, CoachScheduleSourceType } from '@/types/coachSchedule'
import { formatCoachScheduleDateLabel, formatCoachScheduleTimeRange, getCoachScheduleSourceLabel } from '@/utils/coachSchedules'

defineProps<{ event: CoachScheduleEvent; assignedCoachNames: string[] }>()

const getSourcePillClass = (sourceType: CoachScheduleSourceType) => {
  if (sourceType === 'training_location') return 'bg-blue-50 text-blue-700 ring-blue-100'
  if (sourceType === 'training_class') return 'bg-violet-50 text-violet-700 ring-violet-100'
  if (sourceType === 'training_date') return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  if (sourceType === 'match') return 'bg-amber-50 text-amber-700 ring-amber-100'
  return 'bg-slate-100 text-slate-600 ring-slate-200'
}
</script>

<template>
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

    <div v-if="assignedCoachNames.length > 0" class="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold leading-relaxed text-blue-800">
      已指派教練：{{ assignedCoachNames.join('、') }}
    </div>
  </div>
</template>
