<script setup lang="ts">
import { computed } from 'vue'
import type { MatchRecord } from '@/types/match'
import { Calendar, Location, Delete, Operation } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const UNKNOWN_MONTH_KEY = '__unknown__'

const props = withDefaults(defineProps<{
  matches: MatchRecord[]
  sortDirection?: 'asc' | 'desc'
}>(), {
  sortDirection: 'desc'
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
  return dayjs(`${monthKey}-01`).format('YYYY年M月')
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

const isFuture = (date: string) => dayjs(date).isAfter(dayjs(), 'day')

const getResult = (match: MatchRecord) => {
  if (isFuture(match.match_date)) return { label: '未開賽', class: 'bg-blue-100 text-blue-700' }
  if (match.home_score > match.opponent_score) return { label: 'W', class: 'bg-green-100 text-green-700' }
  if (match.home_score < match.opponent_score) return { label: 'L', class: 'bg-red-100 text-red-700' }
  return { label: 'T', class: 'bg-yellow-100 text-yellow-700' }
}
</script>

<template>
  <div class="space-y-8">
    <div v-for="group in groupedMatches" :key="group.month" class="animate-fade-in">
      <div class="flex items-center space-x-3 mb-4">
        <h2 class="text-lg font-extrabold text-gray-800">{{ group.month }}</h2>
        <div class="h-px bg-gray-200 flex-1"></div>
        <span class="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{{ group.items.length }} 筆</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
        <div
          v-for="match in group.items"
          :key="match.id"
          @click="emit('view', match.id)"
          class="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 overflow-hidden cursor-pointer relative"
        >
          <div class="flex justify-between items-center px-5 py-3.5 border-b border-gray-50 bg-gray-50/50">
            <div class="flex items-center space-x-2 text-gray-500 font-medium text-xs">
              <el-icon class="text-sm"><Calendar /></el-icon>
              <span>{{ dayjs(match.match_date).format('MM/DD') }}</span>
              <span v-if="match.match_time" class="text-gray-400">{{ match.match_time }}</span>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-widest" :class="getResult(match).class">
              {{ getResult(match).label }}
            </span>
          </div>

          <div class="p-5 flex flex-col">
            <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div class="flex flex-wrap gap-2">
                <span v-if="match.category_group" class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 font-bold whitespace-nowrap">{{ match.category_group }}</span>
                <span v-if="match.match_level" class="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded border border-orange-100 font-bold whitespace-nowrap">{{ match.match_level }}</span>
              </div>
              <div class="flex items-center gap-2" @click.stop>
                <el-button plain round size="small" class="!font-bold !border-gray-300" @click.stop="emit('edit', match.id)">
                  <el-icon class="mr-1"><Operation /></el-icon> 編輯
                </el-button>
                <el-button plain round size="small" type="danger" class="!font-bold" @click.stop="emit('delete', match.id)">
                  <el-icon class="mr-1"><Delete /></el-icon> 刪除
                </el-button>
              </div>
            </div>

            <h3 class="font-extrabold text-base text-gray-800 line-clamp-1 mb-1">{{ match.match_name }}</h3>
            <div class="flex items-center text-xs text-gray-500 mb-5 line-clamp-1">
              <el-icon class="mr-1"><Location /></el-icon>
              {{ match.location || '未設定地點' }}
            </div>

            <div class="bg-gray-50/80 rounded-xl p-3 flex items-center justify-between border border-gray-100">
              <div class="flex flex-col items-center flex-1">
                <span class="text-xs text-gray-400 font-bold mb-1">主隊</span>
                <span class="font-extrabold text-sm text-gray-800 line-clamp-1">中港熊戰</span>
                <span class="text-2xl font-black mt-1" :class="{'text-primary': match.home_score > match.opponent_score, 'text-gray-800': match.home_score <= match.opponent_score}">
                  {{ isFuture(match.match_date) ? '-' : match.home_score }}
                </span>
              </div>

              <div class="w-8 h-8 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center text-[10px] font-black italic text-gray-300 mx-2 shrink-0">
                VS
              </div>

              <div class="flex flex-col items-center flex-1">
                <span class="text-xs text-gray-400 font-bold mb-1">客隊</span>
                <span class="font-extrabold text-sm text-gray-800 line-clamp-1" :title="match.opponent">{{ match.opponent }}</span>
                <span class="text-2xl font-black mt-1" :class="{'text-red-500': match.opponent_score > match.home_score, 'text-gray-800': match.opponent_score <= match.home_score}">
                  {{ isFuture(match.match_date) ? '-' : match.opponent_score }}
                </span>
              </div>
            </div>

            <div class="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>點卡片查看詳情</span>
              <span class="font-semibold text-gray-500">{{ match.match_date ? dayjs(match.match_date).format('YYYY/MM/DD') : '未設定日期' }}</span>
            </div>
          </div>
        </div>
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
