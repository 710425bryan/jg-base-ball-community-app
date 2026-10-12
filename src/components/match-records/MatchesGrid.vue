<script setup lang="ts">
import { computed } from 'vue'
import type { MatchRecord } from '@/types/match'
import MatchCard from './MatchCard.vue'
import dayjs from 'dayjs'

const UNKNOWN_MONTH_KEY = '__unknown__'

const props = withDefaults(defineProps<{
  matches: MatchRecord[]
  sortDirection?: 'asc' | 'desc'
  canEdit?: boolean
  canDelete?: boolean
  canNotify?: boolean
  notifyingMatchId?: string | null
}>(), {
  sortDirection: 'desc',
  canEdit: true,
  canDelete: true,
  canNotify: false,
  notifyingMatchId: null
})

const emit = defineEmits<{
  (e: 'view', id: string): void
  (e: 'edit', id: string): void
  (e: 'delete', id: string): void
  (e: 'notify', id: string): void
  (e: 'cancel', id: string): void
  (e: 'restore', id: string): void
}>()

const getMonthKey = (match: MatchRecord) => {
  if (!match.match_date) return UNKNOWN_MONTH_KEY
  return dayjs(match.match_date).format('YYYY-MM')
}

const getMonthLabel = (monthKey: string) => {
  if (monthKey === UNKNOWN_MONTH_KEY) return '未設定日期'
  return dayjs(`${monthKey}-01`).format('YYYY 年 M 月')
}

const getMatchSortValue = (match: MatchRecord) => {
  if (!match.match_date) {
    return props.sortDirection === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
  }

  const startTime = match.match_time?.match(/\d{1,2}:\d{2}/)?.[0] || '00:00'
  const value = dayjs(`${match.match_date}T${startTime}`).valueOf()

  if (Number.isNaN(value)) {
    return props.sortDirection === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
  }

  return value
}

const compareMatchesBySchedule = (a: MatchRecord, b: MatchRecord) => {
  const diff = getMatchSortValue(a) - getMatchSortValue(b)
  if (diff !== 0) {
    return props.sortDirection === 'asc' ? diff : -diff
  }

  return a.match_name.localeCompare(b.match_name, 'zh-Hant')
}

const groupedMatches = computed(() => {
  const groups: Record<string, MatchRecord[]> = {}

  props.matches.forEach((match) => {
    const monthKey = getMonthKey(match)
    if (!groups[monthKey]) {
      groups[monthKey] = []
    }
    groups[monthKey].push(match)
  })

  return Object.keys(groups)
    .sort((a, b) => {
      if (a === UNKNOWN_MONTH_KEY) return 1
      if (b === UNKNOWN_MONTH_KEY) return -1

      const diff = dayjs(`${a}-01`).valueOf() - dayjs(`${b}-01`).valueOf()
      return props.sortDirection === 'asc' ? diff : -diff
    })
    .map((monthKey) => ({
      month: getMonthLabel(monthKey),
      items: [...groups[monthKey]].sort(compareMatchesBySchedule)
    }))
})

</script>

<template>
  <div class="space-y-6">
    <div v-for="group in groupedMatches" :key="group.month" class="animate-fade-in">
      <div class="match-month-heading sticky z-10 -mx-4 mb-3 flex items-center gap-3 bg-slate-50 px-4 py-2.5 shadow-[0_1px_0_0_#e2e8f0] backdrop-blur-md md:-mx-6 md:px-6">
        <h2 class="text-base font-black text-slate-800 md:text-lg">{{ group.month }}</h2>
        <div class="h-px flex-1 bg-slate-200"></div>
        <span class="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">{{ group.items.length }} 場</span>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <MatchCard
          v-for="match in group.items"
          :key="match.id"
          :match="match"
          :can-edit="props.canEdit"
          :can-delete="props.canDelete"
          :can-notify="props.canNotify"
          :notifying-match-id="props.notifyingMatchId"
          @view="emit('view', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
          @notify="emit('notify', $event)"
          @cancel="emit('cancel', $event)"
          @restore="emit('restore', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.match-month-heading {
  top: 0;
}

@media (min-width: 768px) {
  .match-month-heading {
    top: var(--match-records-sticky-offset, 0px);
  }
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
