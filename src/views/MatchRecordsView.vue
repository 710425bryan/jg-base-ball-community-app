<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, Filter, Calendar, Plus } from '@element-plus/icons-vue'
import { useMatchesStore } from '@/stores/matches'
import { usePermissionsStore } from '@/stores/permissions'
import MatchesGrid from '@/components/match-records/MatchesGrid.vue'
import MatchesTable from '@/components/match-records/MatchesTable.vue'
import MatchDetailDialog from '@/components/match-records/MatchDetailDialog.vue'
import MatchFormDialog from '@/components/match-records/MatchFormDialog.vue'
import SyncCalendarDialog from '@/components/match-records/SyncCalendarDialog.vue'
import MatchTournamentStatsTab from '@/components/match-records/MatchTournamentStatsTab.vue'
import MatchAttendanceStatsTab from '@/components/match-records/MatchAttendanceStatsTab.vue'
import ViewModeSwitch from '@/components/ViewModeSwitch.vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { MatchRecord } from '@/types/match'

const matchesStore = useMatchesStore()
const permissionsStore = usePermissionsStore()
const route = useRoute()
const router = useRouter()

type MatchRecordsTab = 'past' | 'future' | 'tournament_stats' | 'attendance'

const activeMainTab = ref<MatchRecordsTab>('past')

const searchQuery = ref('')
const selectedGroup = ref('')
const selectedLevel = ref('')

type MonthRange = [string, string]

const createDefaultMonthRange = (): MonthRange => [
  dayjs().format('YYYY-MM'),
  dayjs().add(1, 'month').format('YYYY-MM')
]

const selectedMonthRange = ref<MonthRange>(createDefaultMonthRange())

const selectedStartMonth = computed({
  get: () => selectedMonthRange.value[0],
  set: (value: string) => {
    const nextStart = value || selectedMonthRange.value[0]
    const currentEnd = selectedMonthRange.value[1]
    selectedMonthRange.value = nextStart > currentEnd
      ? [nextStart, nextStart]
      : [nextStart, currentEnd]
  }
})

const selectedEndMonth = computed({
  get: () => selectedMonthRange.value[1],
  set: (value: string) => {
    const currentStart = selectedMonthRange.value[0]
    const nextEnd = value || selectedMonthRange.value[1]
    selectedMonthRange.value = nextEnd < currentStart
      ? [nextEnd, nextEnd]
      : [currentStart, nextEnd]
  }
})

const hasAdvancedFilters = computed(() =>
  Boolean(selectedGroup.value || selectedLevel.value || (selectedMonthRange.value[0] && selectedMonthRange.value[1]))
)

// Table vs Grid
const viewMode = ref<'table' | 'grid'>('grid')

// Dialog states
const detailDialogVisible = ref(false)
const formDialogVisible = ref(false)
const syncDialogVisible = ref(false)
const selectedMatchId = ref<string | null>(null)
const formMode = ref<'add' | 'edit'>('add')

const canCreateMatches = computed(() => permissionsStore.can('matches', 'CREATE'))
const canEditMatches = computed(() => permissionsStore.can('matches', 'EDIT'))
const canDeleteMatches = computed(() => permissionsStore.can('matches', 'DELETE'))
const canSyncMatches = computed(() => canCreateMatches.value || canEditMatches.value)

const getRouteMatchId = () => {
  const rawMatchId = route.query.match_id
  return typeof rawMatchId === 'string' ? rawMatchId.trim() : ''
}

const clearRouteMatchId = () => {
  if (!route.query.match_id) return

  const nextQuery = { ...route.query }
  delete nextQuery.match_id
  void router.replace({ query: nextQuery })
}

const openMatchFromRoute = async () => {
  const routeMatchId = getRouteMatchId()
  if (!routeMatchId) return

  if (!matchesStore.matches.some((match) => match.id === routeMatchId)) {
    await matchesStore.fetchMatches()
  }

  const targetMatch = matchesStore.matches.find((match) => match.id === routeMatchId)
  if (!targetMatch) {
    selectedMatchId.value = null
    detailDialogVisible.value = false
    ElMessage.warning('找不到這筆比賽資料')
    clearRouteMatchId()
    return
  }

  activeMainTab.value = dayjs(targetMatch.match_date).isAfter(dayjs().startOf('day'), 'day') ? 'future' : 'past'
  selectedMatchId.value = routeMatchId
  detailDialogVisible.value = true
}

const initializeMatches = async () => {
  await matchesStore.fetchMatches()
  await openMatchFromRoute()
}

onMounted(() => {
  void initializeMatches()
})

watch(
  () => route.query.match_id,
  () => {
    void openMatchFromRoute()
  }
)

watch(detailDialogVisible, (visible) => {
  if (!visible) {
    clearRouteMatchId()
  }
})

const getMatchSortValue = (match: MatchRecord) => {
  if (!match.match_date) return null

  const startTime = match.match_time?.match(/\d{1,2}:\d{2}/)?.[0] || '00:00'
  const value = dayjs(`${match.match_date}T${startTime}`).valueOf()

  return Number.isNaN(value) ? null : value
}

const compareMatchesBySchedule = (a: MatchRecord, b: MatchRecord, direction: 'asc' | 'desc') => {
  const aValue = getMatchSortValue(a)
  const bValue = getMatchSortValue(b)

  if (aValue === null && bValue === null) {
    return a.match_name.localeCompare(b.match_name, 'zh-Hant')
  }

  if (aValue === null) return direction === 'asc' ? 1 : -1
  if (bValue === null) return direction === 'asc' ? -1 : 1

  const diff = aValue - bValue
  if (diff !== 0) {
    return direction === 'asc' ? diff : -diff
  }

  return a.match_name.localeCompare(b.match_name, 'zh-Hant')
}

const filteredBaseMatches = computed(() => {
  let result = matchesStore.matches

  // --- Search & Advanced Filters ---
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(m => 
      m.match_name.toLowerCase().includes(query) ||
      m.opponent.toLowerCase().includes(query) ||
      (m.location && m.location.toLowerCase().includes(query)) ||
      (m.category_group && m.category_group.toLowerCase().includes(query))
    )
  }

  if (selectedGroup.value) {
    result = result.filter(m => m.category_group === selectedGroup.value)
  }

  if (selectedLevel.value) {
    result = result.filter(m => m.match_level === selectedLevel.value)
  }

  const [startMonth, endMonth] = selectedMonthRange.value
  if (startMonth && endMonth) {
    result = result.filter((m) => {
      if (!m.match_date) return false

      const matchMonth = m.match_date.slice(0, 7)
      return matchMonth >= startMonth && matchMonth <= endMonth
    })
  }

  return result
})

const pastFilteredMatches = computed(() => {
  const tomorrow = dayjs().startOf('day').add(1, 'day')
  return [...filteredBaseMatches.value]
    .filter(m => !m.match_date || dayjs(m.match_date).isBefore(tomorrow))
    .sort((a, b) => compareMatchesBySchedule(a, b, 'desc'))
})

const futureFilteredMatches = computed(() => {
  const today = dayjs().startOf('day')
  return [...filteredBaseMatches.value]
    .filter(m => m.match_date && dayjs(m.match_date).isAfter(today, 'day'))
    .sort((a, b) => compareMatchesBySchedule(a, b, 'asc'))
})

const filteredMatches = computed(() => {
  return activeMainTab.value === 'future'
    ? futureFilteredMatches.value
    : pastFilteredMatches.value
})

const isListTab = computed(() => activeMainTab.value === 'past' || activeMainTab.value === 'future')

const groups = computed(() => {
  const allGroups = matchesStore.matches.map(m => m.category_group).filter(Boolean) as string[]
  return [...new Set(allGroups)]
})

const levels = computed(() => {
  const allLevels = matchesStore.matches.map(m => m.match_level).filter(Boolean) as string[]
  return [...new Set(allLevels)]
})

const handleViewMatch = (id: string) => {
  selectedMatchId.value = id
  detailDialogVisible.value = true
}

const handleEditMatch = (id: string) => {
  selectedMatchId.value = id
  formMode.value = 'edit'
  formDialogVisible.value = true
}

const handleAddMatch = () => {
  selectedMatchId.value = null
  formMode.value = 'add'
  formDialogVisible.value = true
}

const handleDeleteMatch = async (id: string) => {
  const targetMatch = matchesStore.matches.find((match) => match.id === id)
  if (!targetMatch) return

  try {
    await ElMessageBox.confirm(
      `確定要刪除「${targetMatch.match_name}」嗎？此操作無法復原。`,
      '刪除比賽紀錄',
      {
        type: 'error',
        confirmButtonText: '刪除',
        confirmButtonClass: 'el-button--danger',
        cancelButtonText: '取消'
      }
    )

    await matchesStore.deleteMatch(id)

    if (selectedMatchId.value === id) {
      selectedMatchId.value = null
      detailDialogVisible.value = false
      formDialogVisible.value = false
    }

    ElMessage.success('已刪除比賽紀錄')
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') {
      return
    }

    ElMessage.error(`刪除失敗：${error?.message || '請稍後再試'}`)
  }
}

const handleSyncCalendar = () => {
  syncDialogVisible.value = true
}
</script>

<template>
  <div class="h-full flex flex-col pt-[env(safe-area-inset-top)] pb-[calc(1rem+env(safe-area-inset-bottom))] relative">
    
    <!-- Sticky Toolbar -->
    <div class="sticky top-0 z-20 bg-background/95 backdrop-blur-md pt-3 md:pt-4">
      <div class="px-4 pb-0 md:px-6 flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
      
      <!-- Title & Icon -->
      <div class="flex items-center space-x-3 shrink-0 mb-1 lg:mb-4">
        <div class="bg-primary/10 p-2 md:p-2.5 rounded-xl border border-primary/20 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 md:w-7 md:h-7 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
            <path d="M4 22h16"></path>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
          </svg>
        </div>
        <div>
          <h1 class="app-page-title">比賽紀錄</h1>
          <p class="app-page-subtitle">Match Records</p>
        </div>
      </div>

        <!-- Action & Filter Bar -->
        <div class="flex-1 flex flex-wrap items-center lg:justify-end gap-2 sm:gap-3 w-full lg:w-auto mb-2 lg:mb-4">
          
          <!-- Search -->
          <div class="relative flex-1 sm:flex-none sm:min-w-[200px]">
            <el-input
              v-model="searchQuery"
              placeholder="搜尋對手、地點、賽事..."
              :prefix-icon="Search"
              clearable
              class="w-full !rounded-xl"
            />
          </div>

        <!-- Filter Popover -->
        <el-popover placement="bottom" :width="280" trigger="click" popper-style="border-radius: 12px; padding: 16px;">
          <template #reference>
            <el-button class="!rounded-xl px-3 bg-white hover:bg-gray-50 text-gray-700 border-gray-200">
              <el-icon class="mr-1.5"><Filter /></el-icon>篩選
              <span v-if="hasAdvancedFilters" class="ml-1.5 w-2 h-2 rounded-full bg-primary"></span>
            </el-button>
          </template>
          
          <div class="space-y-4">
            <h3 class="font-bold text-gray-800 text-sm mb-2">進階篩選</h3>
            <div>
              <label class="text-xs text-gray-500 font-bold mb-1 block">組別</label>
              <el-select v-model="selectedGroup" clearable placeholder="全部" class="w-full">
                <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
              </el-select>
            </div>
            <div>
              <label class="text-xs text-gray-500 font-bold mb-1 block">賽事等級</label>
              <el-select v-model="selectedLevel" clearable placeholder="全部" class="w-full">
                <el-option v-for="l in levels" :key="l" :label="l" :value="l" />
              </el-select>
            </div>
            <div>
              <label class="text-xs text-gray-500 font-bold mb-1 block">月份區間</label>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <el-date-picker
                  v-model="selectedStartMonth"
                  type="month"
                  format="YYYY-MM"
                  value-format="YYYY-MM"
                  placeholder="開始月份"
                  class="!w-full"
                  :clearable="false"
                />
                <span class="hidden text-center text-xs font-bold text-gray-400 sm:block">至</span>
                <el-date-picker
                  v-model="selectedEndMonth"
                  type="month"
                  format="YYYY-MM"
                  value-format="YYYY-MM"
                  placeholder="結束月份"
                  class="!w-full"
                  :clearable="false"
                />
              </div>
            </div>
          </div>
        </el-popover>

        <ViewModeSwitch v-if="isListTab" v-model="viewMode" class="shrink-0" />

        <!-- Tool Buttons -->
        <div v-if="isListTab && (canSyncMatches || canCreateMatches)" class="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <el-button v-if="canSyncMatches" @click="handleSyncCalendar" class="flex-1 sm:flex-none !rounded-xl text-gray-700 bg-white hover:bg-gray-50 border-gray-200">
            <el-icon class="mr-1.5 text-blue-500"><Calendar /></el-icon>同步行事曆
          </el-button>
          
          <el-button v-if="canCreateMatches" @click="handleAddMatch" type="primary" class="flex-1 sm:flex-none !rounded-xl !bg-primary !border-primary hover:!bg-primary/90 !text-white shadow-sm shadow-primary/20 px-5 font-bold">
            <el-icon class="mr-1.5 text-lg"><Plus /></el-icon>新增
          </el-button>
        </div>

      </div>
    </div>
      
    <!-- Modern Tabs under Sticky Header -->
    <div class="px-4 md:px-6 flex gap-6 mt-1 lg:mt-0 bg-white/50 backdrop-blur-sm shadow-[0_1px_0_0_#f3f4f6] overflow-x-auto">
      <button 
        @click="activeMainTab = 'past'" 
        :class="[
          'pb-3 pt-1 font-bold text-sm px-1 transition-colors relative whitespace-nowrap',
          activeMainTab === 'past' ? 'text-primary' : 'text-gray-500 hover:text-gray-800'
        ]"
      >
        賽事紀錄
        <div v-if="activeMainTab === 'past'" class="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></div>
      </button>
      <button 
        @click="activeMainTab = 'future'" 
        :class="[
          'pb-3 pt-1 font-bold text-sm px-1 transition-colors relative whitespace-nowrap',
          activeMainTab === 'future' ? 'text-primary' : 'text-gray-500 hover:text-gray-800'
        ]"
      >
        未來賽事
        <div v-if="activeMainTab === 'future'" class="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></div>
      </button>
      <button
        @click="activeMainTab = 'tournament_stats'"
        :class="[
          'pb-3 pt-1 font-bold text-sm px-1 transition-colors relative whitespace-nowrap',
          activeMainTab === 'tournament_stats' ? 'text-primary' : 'text-gray-500 hover:text-gray-800'
        ]"
      >
        賽事成績
        <div v-if="activeMainTab === 'tournament_stats'" class="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></div>
      </button>
      <button
        @click="activeMainTab = 'attendance'"
        :class="[
          'pb-3 pt-1 font-bold text-sm px-1 transition-colors relative whitespace-nowrap',
          activeMainTab === 'attendance' ? 'text-primary' : 'text-gray-500 hover:text-gray-800'
        ]"
      >
        賽事出席率
        <div v-if="activeMainTab === 'attendance'" class="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></div>
      </button>
    </div>

    </div>
    
    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto p-4 md:p-6 pb-24" v-loading="matchesStore.loading">
      
      <!-- Empty State -->
      <div v-if="isListTab && !matchesStore.loading && filteredMatches.length === 0" class="h-64 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
        <div class="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
           <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <h3 class="text-gray-800 font-bold text-lg mb-2">尚無比賽紀錄</h3>
        <p class="text-sm text-gray-500 mb-6 font-medium">看來這邊還沒有任何紀錄，或是沒有符合您搜尋條件的賽事。</p>
        <el-button v-if="canCreateMatches" @click="handleAddMatch" type="primary" plain class="!rounded-xl font-bold">立即新增第一場比賽</el-button>
      </div>

      <!-- Data Views -->
      <template v-else-if="isListTab">
        <MatchesGrid 
          v-if="viewMode === 'grid'" 
          :matches="filteredMatches" 
          :sort-direction="activeMainTab === 'future' ? 'asc' : 'desc'"
          :can-edit="canEditMatches"
          :can-delete="canDeleteMatches"
          @view="handleViewMatch" 
          @edit="handleEditMatch" 
          @delete="handleDeleteMatch"
        />
        <MatchesTable 
          v-else 
          :matches="filteredMatches" 
          :can-edit="canEditMatches"
          :can-delete="canDeleteMatches"
          :can-notify="canSyncMatches"
          @view="handleViewMatch" 
          @edit="handleEditMatch" 
          @delete="handleDeleteMatch"
        />
      </template>
      <MatchTournamentStatsTab
        v-else-if="activeMainTab === 'tournament_stats'"
        :matches="pastFilteredMatches"
      />
      <MatchAttendanceStatsTab
        v-else
        :matches="pastFilteredMatches"
      />
    </div>

    <!-- Dialogs -->
    <MatchDetailDialog v-model="detailDialogVisible" :match-id="selectedMatchId" :readonly="!canEditMatches" @edit="handleEditMatch(selectedMatchId!)" />
    <MatchFormDialog v-model="formDialogVisible" :match-id="selectedMatchId" :mode="formMode" />
    <SyncCalendarDialog v-model="syncDialogVisible" />

  </div>
</template>

<style scoped>
/* Scoped overrides if necessary */
</style>
