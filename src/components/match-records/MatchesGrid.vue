<script setup lang="ts">
import { computed } from 'vue'
import type { MatchRecord } from '@/types/match'
import { Calendar, Delete, Location, Operation, Trophy, VideoCamera } from '@element-plus/icons-vue'
import { normalizeExternalUrl } from '@/utils/externalUrl'
import dayjs from 'dayjs'

const UNKNOWN_MONTH_KEY = '__unknown__'

const props = withDefaults(defineProps<{
  matches: MatchRecord[]
  sortDirection?: 'asc' | 'desc'
  canEdit?: boolean
  canDelete?: boolean
}>(), {
  sortDirection: 'desc',
  canEdit: true,
  canDelete: true
})

const emit = defineEmits<{
  (e: 'view', id: string): void
  (e: 'edit', id: string): void
  (e: 'delete', id: string): void
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

const isFuture = (date?: string) => Boolean(date && dayjs(date).isAfter(dayjs(), 'day'))

const getResult = (match: MatchRecord) => {
  if (isFuture(match.match_date)) {
    return { label: '未賽', emoji: '', title: '未賽', class: 'bg-sky-500 text-white ring-1 ring-sky-300/70' }
  }
  if (match.home_score > match.opponent_score) {
    return { label: 'W', emoji: '🏆', title: '勝利', class: 'bg-emerald-500 text-white ring-1 ring-emerald-300/70' }
  }
  if (match.home_score < match.opponent_score) {
    return { label: 'L', emoji: '💔', title: '敗場', class: 'bg-rose-500 text-white ring-1 ring-rose-300/70' }
  }
  return { label: 'T', emoji: '🤝', title: '平手', class: 'bg-amber-500 text-white ring-1 ring-amber-300/70' }
}

const getGoogleMapsUrl = (location?: string) => {
  const normalizedLocation = location?.trim()
  if (!normalizedLocation) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalizedLocation)}`
}

const formatMatchDate = (date?: string) => {
  if (!date) return '未設定日期'
  return dayjs(date).format('YYYY/MM/DD')
}
</script>

<template>
  <div class="space-y-6">
    <div v-for="group in groupedMatches" :key="group.month" class="animate-fade-in">
      <div class="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-3 bg-background/95 px-4 py-2.5 shadow-[0_1px_0_0_#e2e8f0] backdrop-blur-md md:-mx-6 md:px-6">
        <h2 class="text-base font-black text-slate-800 md:text-lg">{{ group.month }}</h2>
        <div class="h-px flex-1 bg-slate-200"></div>
        <span class="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">{{ group.items.length }} 場</span>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <article
          v-for="match in group.items"
          :key="match.id"
          class="relative cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-orange-50 via-white to-sky-50 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
          @click="emit('view', match.id)"
        >
          <div class="flex items-center justify-between gap-3 bg-slate-900 px-4 py-2.5 text-white">
            <div class="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-100">
              <el-icon class="shrink-0 text-sm text-primary"><Calendar /></el-icon>
              <span class="whitespace-nowrap">{{ match.match_date ? dayjs(match.match_date).format('MM/DD') : '未定' }}</span>
              <span v-if="match.match_time" class="truncate text-slate-300">{{ match.match_time }}</span>
            </div>
            <span
              class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black leading-none"
              :class="getResult(match).class"
              :title="getResult(match).title"
            >
              <span v-if="getResult(match).emoji" aria-hidden="true" class="text-[11px] leading-none">{{ getResult(match).emoji }}</span>
              <span>{{ getResult(match).label }}</span>
            </span>
          </div>

          <div class="space-y-3 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 space-y-2">
                <div v-if="match.tournament_name" class="flex min-w-0 items-center gap-1.5 text-xs font-black text-orange-700">
                  <el-icon class="shrink-0 text-sm"><Trophy /></el-icon>
                  <span class="truncate" :title="match.tournament_name">{{ match.tournament_name }}</span>
                </div>
                <h3 class="line-clamp-1 text-base font-black leading-snug text-slate-900" :title="match.match_name">
                  {{ match.match_name }}
                </h3>
              </div>

              <div v-if="props.canEdit || props.canDelete" class="flex shrink-0 items-center gap-1" @click.stop>
                <el-tooltip v-if="props.canEdit" content="編輯" placement="top">
                  <el-button circle size="small" class="!border-slate-200 !bg-white/80 !text-slate-500 hover:!border-primary/40 hover:!text-primary" @click.stop="emit('edit', match.id)">
                    <el-icon><Operation /></el-icon>
                  </el-button>
                </el-tooltip>
                <el-tooltip v-if="props.canDelete" content="刪除" placement="top">
                  <el-button circle size="small" class="!border-slate-200 !bg-white/80 !text-slate-500 hover:!border-rose-200 hover:!text-rose-500" @click.stop="emit('delete', match.id)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
            </div>

            <div class="flex flex-wrap gap-1.5">
              <span v-if="match.category_group" class="rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">{{ match.category_group }}</span>
              <span v-if="match.match_level" class="rounded-md border border-orange-200 bg-orange-100/80 px-2 py-0.5 text-[10px] font-black text-orange-800">{{ match.match_level }}</span>
              <a
                v-if="normalizeExternalUrl(match.video_url)"
                :href="normalizeExternalUrl(match.video_url)"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700 transition-colors hover:bg-sky-100"
                title="觀看比賽影片"
                @click.stop
              >
                <el-icon class="text-xs"><VideoCamera /></el-icon>
                <span>影片</span>
              </a>
            </div>

            <a
              v-if="match.location"
              :href="getGoogleMapsUrl(match.location)"
              target="_blank"
              rel="noopener noreferrer"
              class="flex min-w-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white/70 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
              :title="match.location"
              @click.stop
            >
              <el-icon class="shrink-0 text-sm text-sky-600"><Location /></el-icon>
              <span class="truncate">{{ match.location }}</span>
            </a>
            <div v-else class="flex items-center gap-1.5 rounded-md border border-dashed border-slate-200 bg-white/50 px-2.5 py-1.5 text-xs font-bold text-slate-400">
              <el-icon class="text-sm"><Location /></el-icon>
              <span>未設定地點</span>
            </div>

            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-md border border-slate-200 bg-white/75 px-3 py-2.5">
              <div class="min-w-0 text-center">
                <span class="block text-[10px] font-black uppercase tracking-normal text-slate-400">本隊</span>
                <span class="mt-0.5 block truncate text-xs font-extrabold text-slate-700">中港熊戰</span>
                <span class="mt-1 block text-2xl font-black leading-none" :class="{'text-primary': match.home_score > match.opponent_score, 'text-slate-800': match.home_score <= match.opponent_score}">
                  {{ isFuture(match.match_date) ? '-' : match.home_score }}
                </span>
              </div>

              <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black italic text-white shadow-sm">
                VS
              </div>

              <div class="min-w-0 text-center">
                <span class="block text-[10px] font-black uppercase tracking-normal text-slate-400">對手</span>
                <span class="mt-0.5 block truncate text-xs font-extrabold text-slate-700" :title="match.opponent">{{ match.opponent }}</span>
                <span class="mt-1 block text-2xl font-black leading-none" :class="{'text-rose-500': match.opponent_score > match.home_score, 'text-slate-800': match.opponent_score <= match.home_score}">
                  {{ isFuture(match.match_date) ? '-' : match.opponent_score }}
                </span>
              </div>
            </div>

            <div class="flex items-center justify-between border-t border-slate-200 pt-2 text-[11px] font-bold text-slate-500">
              <span>比賽日期</span>
              <span class="text-slate-700">{{ formatMatchDate(match.match_date) }}</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
