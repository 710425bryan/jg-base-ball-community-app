<script setup lang="ts">
import { computed } from 'vue'
import type { MatchRecord } from '@/types/match'
import { Trophy, Location, Timer, ArrowRight, VideoCamera, Operation, DocumentCopy, Delete } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const props = defineProps<{
  matches: MatchRecord[]
}>()

const emit = defineEmits<{
  (e: 'view', id: string): void
  (e: 'edit', id: string): void
}>()

// Group matches by YYYY-MM
const groupedMatches = computed(() => {
  const groups: Record<string, MatchRecord[]> = {}
  
  props.matches.forEach(m => {
    // If no match_date, put in "Unknown"
    const monthKey = m.match_date ? dayjs(m.match_date).format('YYYY年 M月') : '未定日期'
    if (!groups[monthKey]) {
      groups[monthKey] = []
    }
    groups[monthKey].push(m)
  })

  // Sort groups descending (latest month first)
  return Object.keys(groups).sort((a, b) => {
    if (a === '未定日期') return 1;
    if (b === '未定日期') return -1;
    return dayjs(b, 'YYYY年 M月').valueOf() - dayjs(a, 'YYYY年 M月').valueOf()
  }).map(key => ({
    month: key,
    items: groups[key].sort((a, b) => dayjs(b.match_date).valueOf() - dayjs(a.match_date).valueOf())
  }))
})

// Check if a match is future
const isFuture = (date: string) => {
  return dayjs(date).isAfter(dayjs(), 'day')
}

// Check if win/lose
const getResult = (m: MatchRecord) => {
  if (isFuture(m.match_date)) return { label: '即將開打', type: 'info', class: 'bg-blue-100 text-blue-700' }
  if (m.home_score > m.opponent_score) return { label: 'W 勝', type: 'success', class: 'bg-green-100 text-green-700' }
  if (m.home_score < m.opponent_score) return { label: 'L 敗', type: 'danger', class: 'bg-red-100 text-red-700' }
  return { label: 'T 和', type: 'warning', class: 'bg-yellow-100 text-yellow-700' }
}
</script>

<template>
  <div class="space-y-8">
    <div v-for="group in groupedMatches" :key="group.month" class="animate-fade-in">
      
      <!-- Month Header -->
      <div class="flex items-center space-x-3 mb-4">
        <h2 class="text-lg font-extrabold text-gray-800">{{ group.month }}</h2>
        <div class="h-px bg-gray-200 flex-1"></div>
        <span class="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{{ group.items.length }} 場</span>
      </div>

      <!-- Match Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
        <div 
          v-for="match in group.items" 
          :key="match.id" 
          @click="emit('view', match.id)"
          class="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200 overflow-hidden cursor-pointer relative"
        >
          <!-- Hover Actions Override -->
          <div class="absolute inset-0 bg-white/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity z-10 flex flex-col items-center justify-center gap-3">
            <el-button @click.stop="emit('view', match.id)" type="primary" round class="w-2/3 !text-sm font-bold shadow-md">
              <el-icon class="mr-1"><VideoCamera /></el-icon> 檢視詳情
            </el-button>
            <el-button @click.stop="emit('edit', match.id)" plain round class="w-2/3 !text-sm font-bold shadow-sm border-gray-300">
              <el-icon class="mr-1"><Operation /></el-icon> 編輯紀錄
            </el-button>
          </div>

          <!-- Card Header (Date & Result) -->
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

          <!-- Card Body -->
          <div class="p-5 flex flex-col">
            <!-- Tags -->
            <div class="flex gap-2 mb-3">
              <span v-if="match.category_group" class="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 font-bold whitespace-nowrap">{{ match.category_group }}</span>
              <span v-if="match.match_level" class="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded border border-orange-100 font-bold whitespace-nowrap">{{ match.match_level }}</span>
            </div>

            <!-- Title & Location -->
            <h3 class="font-extrabold text-base text-gray-800 line-clamp-1 mb-1">{{ match.match_name }}</h3>
            <div class="flex items-center text-xs text-gray-500 mb-5 line-clamp-1">
              <el-icon class="mr-1"><Location /></el-icon>
              {{ match.location || '比賽地點未定' }}
            </div>

            <!-- VS Layout -->
            <div class="bg-gray-50/80 rounded-xl p-3 flex items-center justify-between border border-gray-100">
              <!-- Home -->
              <div class="flex flex-col items-center flex-1">
                <span class="text-xs text-gray-400 font-bold mb-1">主隊</span>
                <span class="font-extrabold text-sm text-gray-800 line-clamp-1">中港熊戰</span>
                <span class="text-2xl font-black mt-1" :class="{'text-primary': match.home_score > match.opponent_score, 'text-gray-800': match.home_score <= match.opponent_score}">
                  {{ isFuture(match.match_date) ? '-' : match.home_score }}
                </span>
              </div>
              
              <!-- VS Badge -->
              <div class="w-8 h-8 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center text-[10px] font-black italic text-gray-300 mx-2 shrink-0">
                VS
              </div>

              <!-- Away -->
              <div class="flex flex-col items-center flex-1">
                <span class="text-xs text-gray-400 font-bold mb-1">客隊</span>
                <span class="font-extrabold text-sm text-gray-800 line-clamp-1" :title="match.opponent">{{ match.opponent }}</span>
                <span class="text-2xl font-black mt-1" :class="{'text-red-500': match.opponent_score > match.home_score, 'text-gray-800': match.opponent_score <= match.home_score}">
                  {{ isFuture(match.match_date) ? '-' : match.opponent_score }}
                </span>
              </div>
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
