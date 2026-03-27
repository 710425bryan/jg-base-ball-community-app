<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Search, Filter, Calendar, Grid, Document, CopyDocument, TopRight, Plus } from '@element-plus/icons-vue'
import { useMatchesStore } from '@/stores/matches'
import MatchesGrid from '@/components/match-records/MatchesGrid.vue'
import MatchesTable from '@/components/match-records/MatchesTable.vue'
import MatchDetailDialog from '@/components/match-records/MatchDetailDialog.vue'
import MatchFormDialog from '@/components/match-records/MatchFormDialog.vue'
import SyncCalendarDialog from '@/components/match-records/SyncCalendarDialog.vue'
import dayjs from 'dayjs'

const matchesStore = useMatchesStore()

const activeMainTab = ref<'past' | 'future'>('past')

const searchQuery = ref('')
const selectedGroup = ref('')
const selectedLevel = ref('')
const selectedMonth = ref('')

// Table vs Grid
const viewMode = ref<'table' | 'grid'>('grid')

// Dialog states
const detailDialogVisible = ref(false)
const formDialogVisible = ref(false)
const syncDialogVisible = ref(false)
const selectedMatchId = ref<string | null>(null)
const formMode = ref<'add' | 'edit'>('add')

onMounted(() => {
  matchesStore.fetchMatches()
})

const filteredMatches = computed(() => {
  let result = matchesStore.matches

  // --- Tab Filtering ---
  const today = dayjs().startOf('day')
  if (activeMainTab.value === 'past') {
    // Show matches today and before
    result = result.filter(m => !m.match_date || dayjs(m.match_date).isBefore(today.add(1, 'day')))
  } else {
    // Show matches strictly after today
    result = result.filter(m => m.match_date && dayjs(m.match_date).isAfter(today, 'day'))
  }

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

  if (selectedMonth.value) {
    result = result.filter(m => m.match_date && m.match_date.startsWith(selectedMonth.value))
  }

  return result
})

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
          <h1 class="text-xl md:text-2xl font-extrabold text-gray-900 tracking-tight leading-none mb-1">比賽紀錄</h1>
          <p class="text-xs text-gray-500 font-medium">Match Records</p>
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
              <span v-if="selectedGroup || selectedLevel || selectedMonth" class="ml-1.5 w-2 h-2 rounded-full bg-primary"></span>
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
              <label class="text-xs text-gray-500 font-bold mb-1 block">月份</label>
              <el-date-picker v-model="selectedMonth" type="month" format="YYYY-MM" value-format="YYYY-MM" placeholder="選擇月份" class="!w-full" clearable />
            </div>
          </div>
        </el-popover>

        <!-- 切換顯示模式 -->
        <div class="bg-gray-100 p-1 rounded-lg shadow-inner shrink-0 hidden md:flex items-center">
          <button @click="viewMode = 'grid'" :class="['px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5', viewMode === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600']">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            <span class="hidden sm:inline">網格</span>
          </button>
          <button @click="viewMode = 'table'" :class="['px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5', viewMode === 'table' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600']">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            <span class="hidden sm:inline">表格</span>
          </button>
        </div>

        <!-- Tool Buttons -->
        <div class="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
          <el-button @click="handleSyncCalendar" class="flex-1 sm:flex-none !rounded-xl text-gray-700 bg-white hover:bg-gray-50 border-gray-200">
            <el-icon class="mr-1.5 text-blue-500"><Calendar /></el-icon>同步行事曆
          </el-button>
          
          <el-button @click="handleAddMatch" type="primary" class="flex-1 sm:flex-none !rounded-xl !bg-primary !border-primary hover:!bg-primary/90 !text-white shadow-sm shadow-primary/20 px-5 font-bold">
            <el-icon class="mr-1.5 text-lg"><Plus /></el-icon>新增
          </el-button>
        </div>

      </div>
    </div>
      
    <!-- Modern Tabs under Sticky Header -->
    <div class="px-4 md:px-6 flex gap-6 mt-1 lg:mt-0 bg-white/50 backdrop-blur-sm shadow-[0_1px_0_0_#f3f4f6]">
      <button 
        @click="activeMainTab = 'past'" 
        :class="[
          'pb-3 pt-1 font-bold text-sm px-1 transition-colors relative', 
          activeMainTab === 'past' ? 'text-primary' : 'text-gray-500 hover:text-gray-800'
        ]"
      >
        賽事紀錄
        <div v-if="activeMainTab === 'past'" class="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></div>
      </button>
      <button 
        @click="activeMainTab = 'future'" 
        :class="[
          'pb-3 pt-1 font-bold text-sm px-1 transition-colors relative', 
          activeMainTab === 'future' ? 'text-primary' : 'text-gray-500 hover:text-gray-800'
        ]"
      >
        未來賽事
        <div v-if="activeMainTab === 'future'" class="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full"></div>
      </button>
    </div>

    </div>
    
    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto p-4 md:p-6 pb-24" v-loading="matchesStore.loading">
      
      <!-- Empty State -->
      <div v-if="!matchesStore.loading && filteredMatches.length === 0" class="h-64 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
        <div class="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
           <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <h3 class="text-gray-800 font-bold text-lg mb-2">尚無比賽紀錄</h3>
        <p class="text-sm text-gray-500 mb-6 font-medium">看來這邊還沒有任何紀錄，或是沒有符合您搜尋條件的賽事。</p>
        <el-button @click="handleAddMatch" type="primary" plain class="!rounded-xl font-bold">立即新增第一場比賽</el-button>
      </div>

      <!-- Data Views -->
      <template v-else>
        <MatchesGrid 
          v-if="viewMode === 'grid'" 
          :matches="filteredMatches" 
          @view="handleViewMatch" 
          @edit="handleEditMatch" 
        />
        <MatchesTable 
          v-else 
          :matches="filteredMatches" 
          @view="handleViewMatch" 
          @edit="handleEditMatch" 
        />
      </template>
    </div>

    <!-- Dialogs -->
    <MatchDetailDialog v-model="detailDialogVisible" :match-id="selectedMatchId" @edit="handleEditMatch(selectedMatchId!)" />
    <MatchFormDialog v-model="formDialogVisible" :match-id="selectedMatchId" :mode="formMode" />
    <SyncCalendarDialog v-model="syncDialogVisible" />

  </div>
</template>

<style scoped>
/* Scoped overrides if necessary */
</style>
