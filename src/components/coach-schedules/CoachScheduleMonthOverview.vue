<script setup lang="ts">
import { computed } from 'vue'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import type { CoachScheduleEvent, CoachScheduleSourceType } from '@/types/coachSchedule'
import { buildCoachScheduleMonthOverview } from '@/utils/coachScheduleMonthOverview'
import { formatCoachScheduleDateLabel, formatCoachScheduleMonthLabel, formatCoachScheduleTimeRange,
  getCoachScheduleMonthStart, getCoachScheduleSourceLabel } from '@/utils/coachSchedules'

const props = withDefaults(defineProps<{
  modelValue: boolean; month: string; events: readonly CoachScheduleEvent[]
  hasUnsavedChanges: boolean; loading?: boolean; error?: string
}>(), { loading: false, error: '' })
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void; (event: 'refresh'): void }>()
const dates = computed(() => buildCoachScheduleMonthOverview(props.events, props.month))
const eventCount = computed(() => dates.value.reduce((count, date) => count + date.rows.length, 0))
const monthLabel = computed(() => formatCoachScheduleMonthLabel(getCoachScheduleMonthStart(props.month)))
const sourceAppearance: Record<CoachScheduleSourceType, { row: string; badge: string }> = {
  training_location: { row: 'border-l-blue-400 bg-blue-50/40', badge: 'bg-blue-50 text-blue-700 ring-blue-100' },
  match: { row: 'border-l-amber-400 bg-amber-50/40', badge: 'bg-amber-50 text-amber-700 ring-amber-100' },
  training_date: { row: 'border-l-emerald-400 bg-emerald-50/40', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  training_class: { row: 'border-l-violet-400 bg-violet-50/40', badge: 'bg-violet-50 text-violet-700 ring-violet-100' },
  manual: { row: 'border-l-slate-300 bg-slate-50/40', badge: 'bg-slate-100 text-slate-600 ring-slate-200' }
}
</script>

<template>
  <el-dialog :model-value="modelValue" title="月份總覽" class="coach-month-overview-dialog coach-feature-theme" width="92%" style="max-width: 860px"
    data-test="coach-month-overview" @update:model-value="emit('update:modelValue', $event)">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-base font-bold text-slate-800">{{ monthLabel }}</h2>
      <span v-if="!loading && !error" class="text-base text-slate-500">{{ dates.length }} 個日期・{{ eventCount }} 筆活動</span>
    </div>
    <p class="mb-4 text-base leading-relaxed text-slate-600">依日期顯示全月活動與已儲存的教練指派。來源篩選不影響總覽。</p>
    <p v-if="hasUnsavedChanges" class="mb-4 rounded-xl bg-amber-50 p-3 text-base leading-relaxed text-amber-800" role="status" data-test="month-overview-dirty">
      排班卡片有未儲存的變更；此處顯示最新已儲存資料，草稿仍保留在卡片中。
    </p>
    <AppLoadingState v-if="loading" text="讀取月份總覽中..." min-height="180px" />
    <div v-else-if="error" class="rounded-xl bg-red-50 p-4 text-base leading-relaxed text-red-700" role="alert" data-test="month-overview-error">
      <p>{{ error }}</p>
      <el-button type="primary" plain class="mt-3 !min-h-11" data-test="refresh-month-overview" @click="emit('refresh')">重試</el-button>
    </div>
    <div v-else class="grid min-w-0 gap-4">
      <p v-if="!dates.length" class="rounded-xl bg-slate-50 p-4 text-base text-slate-500" data-test="month-overview-empty">這個月份目前沒有可排班活動。</p>
      <section v-for="date in dates" :key="date.date" class="min-w-0 overflow-hidden rounded-xl border border-slate-200"
        data-test="month-overview-date-group" :data-date="date.date">
        <h3 class="flex flex-wrap items-center justify-between gap-2 bg-amber-50 px-3 py-2 text-base font-bold text-amber-900">
          {{ formatCoachScheduleDateLabel(date.date) }}<span class="font-normal">{{ date.rows.length }} 筆活動</span>
        </h3>
        <div class="bg-white">
          <article v-for="row in date.rows" :key="row.key" class="grid min-w-0 gap-2 border-l-4 border-t border-t-slate-100 p-3 first:border-t-0 md:grid-cols-[150px_minmax(0,1fr)]"
            :class="sourceAppearance[row.event.source_type].row"
            data-test="month-overview-event" :data-event-key="row.key">
            <div class="flex min-w-0 flex-wrap items-center gap-2 md:flex-col md:items-start">
              <span class="text-base font-bold text-slate-800">{{ formatCoachScheduleTimeRange(row.event) }}</span>
              <span class="rounded-full px-2 py-1 text-sm ring-1" :class="sourceAppearance[row.event.source_type].badge" data-test="month-overview-source">{{ getCoachScheduleSourceLabel(row.event.source_type) }}</span>
            </div>
            <div class="grid min-w-0 gap-1 text-base leading-relaxed">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <h4 class="min-w-0 break-words font-bold text-slate-900">{{ row.event.title }}</h4>
                <span v-if="row.event.status === 'cancelled'" class="rounded-full bg-red-50 px-2 py-1 text-sm font-bold text-red-700">已取消</span>
              </div>
              <p class="break-words text-slate-600">場地：{{ row.event.location || '地點未定' }}</p>
              <p v-if="row.coachNames.length" class="break-words text-slate-800">已指派教練：{{ row.coachNames.join('、') }}</p>
              <p v-else class="font-bold text-amber-700">未指派教練</p>
            </div>
          </article>
        </div>
      </section>
    </div>
    <template #footer>
      <AppDialogFooter confirm-label="關閉" :show-cancel="false" confirm-data-test="close-month-overview" @confirm="emit('update:modelValue', false)" />
    </template>
  </el-dialog>
</template>

<style>
.coach-month-overview-dialog .el-dialog__body { max-height: 65vh; overflow-y: auto; -webkit-overflow-scrolling: touch; }
@media (max-width: 767px) {
  .coach-month-overview-dialog .el-dialog__body { max-height: none; }
  .coach-month-overview-dialog .el-button { min-height: 44px; font-size: 16px; }
}
</style>
