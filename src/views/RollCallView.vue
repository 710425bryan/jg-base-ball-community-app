<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    
    <!-- Header -->
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0 flex flex-col gap-3 z-10 pt-[env(safe-area-inset-top)]">
      <!-- Top Row: Title & Actions -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
        <button @click="router.push('/attendance')" class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </button>
        <div v-if="eventData">
          <h2 class="text-xl md:text-2xl font-black text-slate-800 leading-tight">
            {{ eventData.title }}
          </h2>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-[10px] md:text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-gray-100 text-gray-600 border border-gray-200">{{ eventData.event_type }}</span>
            <span class="text-xs md:text-sm font-bold text-gray-500">{{ eventData.date }}</span>
          </div>
        </div>
        <div v-else-if="isLoading" class="flex flex-col gap-2">
          <div class="w-48 h-6 bg-gray-200 rounded animate-pulse"></div>
          <div class="w-24 h-4 bg-gray-100 rounded animate-pulse"></div>
        </div>
      </div>
      
      <div class="flex items-center gap-3 ml-auto md:ml-0">
        <div class="bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20 flex items-center gap-2">
          <span class="text-xs font-bold text-gray-500 hidden sm:inline">出席率</span>
          <span class="text-sm font-black text-primary">{{ attendanceRate }}%</span>
        </div>
        <button v-if="canDelete" @click="confirmDelete" class="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5" title="刪除點名單">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          <span class="hidden sm:inline">刪除</span>
        </button>
        
        <div v-if="hasAccess" class="flex items-center gap-2 text-sm font-bold bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl transition-colors min-w-[100px] justify-center">
          <template v-if="isSyncing || pendingChangesSize > 0">
            <el-icon class="is-loading text-primary"><Loading /></el-icon>
            <span class="text-primary hidden sm:inline">儲存中</span>
          </template>
          <template v-else>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            <span class="text-green-600 hidden sm:inline">已存檔</span>
          </template>
        </div>
      </div>
      </div>
      
      <!-- Bottom Row: Fixed Search Bar & Filters -->
      <div class="w-full max-w-4xl mx-auto mt-1 flex flex-col gap-3" v-if="!isLoading && playersList.length > 0">
        <!-- Filter Tabs -->
        <div class="overflow-x-auto custom-scrollbar pb-1">
          <div class="flex gap-2">
            <button 
              v-for="filter in ['全部', '泰迪熊(小組)', '黑熊(中組)', '灰熊(大組)', '校隊']" 
              :key="filter"
              @click="activeFilter = filter"
              class="px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border"
              :class="[
                activeFilter === filter 
                  ? 'bg-primary text-white border-primary shadow-sm' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              ]"
            >
              {{ filter }}
            </button>
          </div>
        </div>
        
        <el-input
          v-model="searchQuery"
          placeholder="搜尋姓名或背號..."
          :prefix-icon="Search"
          clearable
          size="large"
          class="w-full shadow-sm"
        />
      </div>
    </div>

    <!-- 點名列表 -->
    <div class="flex-1 overflow-y-auto min-h-0 p-2 md:p-6 pb-2 md:pb-6 relative custom-scrollbar" v-loading="isLoading">

      <div v-if="playersList.length === 0 && !isLoading" class="flex flex-col justify-center items-center h-full text-gray-400 font-bold">
        未找到任何有效之球員名單
      </div>
      
      <div v-else-if="filteredPlayers.length === 0 && !isLoading" class="flex flex-col justify-center items-center h-48 text-gray-400 font-bold bg-white rounded-2xl border border-gray-100 max-w-4xl mx-auto">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        找不到符合條件的球員
      </div>

      <div v-else class="max-w-4xl mx-auto space-y-3">
        <!-- 單一球員點名列 -->
        <div v-for="player in filteredPlayers" :key="player.id" class="bg-white rounded-2xl p-3 md:p-4 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-gray-200 transition-colors">
          
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 md:w-14 md:h-14 rounded-full border border-gray-100 bg-gray-50 flex items-center justify-center text-gray-400 overflow-hidden shrink-0">
              <img v-if="player.avatar_url" :src="player.avatar_url" class="w-full h-full object-cover" />
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
            </div>
            <div>
              <div class="font-black text-slate-800 text-base md:text-lg flex items-center gap-2">
                {{ player.name }}
                <el-tooltip v-if="player.hasOverlapLeave" content="該球員當天有請假紀錄" placement="top">
                  <span class="bg-blue-100 text-blue-600 text-[10px] px-1.5 py-0.5 rounded font-extrabold flex items-center gap-0.5 leading-none">
                     連動請假
                  </span>
                </el-tooltip>
              </div>
              <div class="text-xs font-bold text-gray-400 mt-0.5 flex items-center gap-1">
                身分: {{ player.role }}
                <span v-if="player.jersey_number" class="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono border border-gray-200 leading-none">#{{ player.jersey_number }}</span>
              </div>
            </div>
          </div>

          <!-- 狀態按鈕群 -->
          <div class="flex items-center gap-1.5 w-full md:w-auto bg-gray-50 p-1 rounded-xl shrink-0 overflow-x-auto">
            <button 
              v-for="status in statusOptions" 
              :key="status.value"
              @click="setPlayerStatus(player.id, status.value)"
              class="flex-1 md:w-auto px-3 py-2 rounded-lg text-sm md:text-base font-extrabold transition-all duration-200 relative overflow-hidden flex flex-col md:flex-row items-center justify-center gap-1 min-w-[3.5rem]"
              :class="[
                player.status === status.value 
                  ? `${status.bgClass} ${status.textClass} shadow-sm border border-current` 
                  : 'text-gray-400 hover:bg-gray-100 border border-transparent'
              ]"
            >
              <div v-if="player.status === status.value" class="absolute inset-0 bg-current opacity-10"></div>
              <span>{{ status.icon }}</span>
              {{ status.label }}
            </button>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, Search } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const hasAccess = computed(() => ['ADMIN', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role))
const canDelete = computed(() => ['ADMIN', 'MANAGER'].includes(authStore.profile?.role))

const eventId = route.params.id as string
const isLoading = ref(true)
const isSyncing = ref(false)

const eventData = ref<any>(null)
const playersList = ref<any[]>([])
const searchQuery = ref('')
const activeFilter = ref('全部') // 新增過濾器

const filteredPlayers = computed(() => {
  let result = playersList.value

  // 套用群組 / 身份過濾
  if (activeFilter.value === '校隊') {
    result = result.filter(p => p.role === '校隊')
  } else if (activeFilter.value !== '全部') {
    result = result.filter(p => p.team_group === activeFilter.value)
  }

  // 套用搜尋
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase().trim()
    result = result.filter(p => 
      (p.name && p.name.toLowerCase().includes(q)) || 
      (p.jersey_number && String(p.jersey_number).includes(q))
    )
  }

  return result
})

const statusOptions = [
  { label: '出席', value: '出席', bgClass: 'bg-green-50', textClass: 'text-green-600', icon: '✅' },
  { label: '請假', value: '請假', bgClass: 'bg-blue-50', textClass: 'text-blue-500', icon: '🏖️' }
]

// 計算出席率
const attendanceRate = computed(() => {
  if (playersList.value.length === 0) return 0
  const presentCount = playersList.value.filter(p => p.status === '出席').length
  // 若想扣掉請假的基數可調整分母: const baseCount = playersList.value.filter(p => p.status !== '請假').length || 1
  const baseCount = playersList.value.length
  return Math.round((presentCount / baseCount) * 100)
})

const pendingChanges = ref<Map<string, string>>(new Map())
const pendingChangesSize = computed(() => pendingChanges.value.size)
const syncTimeout = ref<number | null>(null)

const flushChanges = async () => {
  if (pendingChanges.value.size === 0) return
  
  isSyncing.value = true
  // 提取目前的變更並立即清空 Map，讓後續的點擊可以寫入新 Map 避免遺漏
  const entriesToSync = Array.from(pendingChanges.value.entries())
  pendingChanges.value.clear()
  
  try {
    const payloads = entriesToSync.map(([member_id, status]) => ({
      event_id: eventId,
      member_id,
      status
    }))
    
    const { error } = await supabase
      .from('attendance_records')
      .upsert(payloads, { onConflict: 'event_id,member_id' })
      
    if (error) throw error
  } catch (err: any) {
    console.error('Auto-sync failed', err)
    ElMessage.error('自動存檔失敗，請確認網路連線')
  } finally {
    isSyncing.value = false
  }
}

const setPlayerStatus = (playerId: string, status: string) => {
  const p = playersList.value.find(x => x.id === playerId)
  if (p && p.status !== status) {
    p.status = status
    
    // 加入異動對列
    pendingChanges.value.set(playerId, status)
    
    // 進入 Debounce 自動存檔 (防手抖、合併多次點擊，提高效能)
    if (syncTimeout.value) clearTimeout(syncTimeout.value)
    syncTimeout.value = window.setTimeout(() => {
      flushChanges()
    }, 1200) // 延遲 1.2 秒才送 API
  }
}

const fetchData = async () => {
  isLoading.value = true
  try {
    // 1. 取得 Event 資料
    const { data: evData, error: evError } = await supabase
      .from('attendance_events')
      .select('*')
      .eq('id', eventId)
      .single()
      
    if (evError) throw evError
    eventData.value = evData

    // 2. 取得所有球員 (從 team_members 去撈)
    const { data: membersData, error: memberError } = await supabase
      .from('team_members')
      .select('id, name, avatar_url, role, jersey_number, status, team_group')
      .in('role', ['球員', '校隊'])
      .order('name')
      
    if (memberError) throw memberError

    // 3. 取得當天的請假名單
    const { data: leavesData, error: leaveError } = await supabase
      .from('leave_requests')
      .select('user_id')
      .lte('start_date', evData.date)
      .gte('end_date', evData.date)
      
    if (leaveError) throw leaveError
    const userIdsOnLeave = leavesData?.map(l => l.user_id) || []

    // 由於 leave_requests 的 user_id 是對應到 profiles 還是 team_members？ 
    // 依據以往設定 user_id 是 auth.users (profiles)。
    // 但是 team_members 沒有 user_id，如果設計無法輕易對照，我們可以用 name 或是用其他方式對照。
    // *修正*: 若 leave_requests 是由使用者帳號(user_id)發出，我們必須用 profiles.id 查出他的名稱，再去比對 team_members.name。
    const { data: leaveProfiles } = await supabase.from('profiles').select('id, name').in('id', userIdsOnLeave)
    const leaveNames = leaveProfiles?.map(p => p.name) || []

    // 4. 取得已儲存的點名紀錄
    const { data: recordsData, error: recordError } = await supabase
      .from('attendance_records')
      .select('member_id, status')
      .eq('event_id', eventId)
      
    if (recordError) throw recordError
    const recordMap = new Map(recordsData?.map(r => [r.member_id, r.status]))

    // 5. 組裝最終 List
    // 過濾掉退隊人員，但若該人員在此點名單已有紀錄（歷史紀錄），則保留顯示
    const activeMembers = membersData?.filter(m => m.status !== '退隊' || recordMap.has(m.id)) || []
    
    // 收集尚未在資料庫擁有紀錄的球員，稍後於背景自動補齊
    const unrecordedMembers: Array<{member_id: string, status: string}> = []

    playersList.value = activeMembers.map(m => {
      let status = recordMap.get(m.id)
      const hasOverlapLeave = leaveNames.includes(m.name)
      
      if (!status) {
        // 沒有點名紀錄時，判斷是否請假預設
        status = '請假' // 預設請假
        unrecordedMembers.push({ member_id: m.id, status })
      }
      
      return {
        ...m,
        status,
        hasOverlapLeave
      }
    }) || []

    // 背景非同步自動補齊缺漏的預設點名紀錄 (預設請假)，避免沒點到的人在統計時不算數
    if (unrecordedMembers.length > 0) {
      const payloads = unrecordedMembers.map(u => ({
        event_id: eventId,
        member_id: u.member_id,
        status: u.status
      }))
      supabase.from('attendance_records')
        .upsert(payloads, { onConflict: 'event_id,member_id' })
        .then()
        .catch(e => console.error("Auto sync missing records failed:", e))
    }

  } catch (err: any) {
    ElMessage.error('資料讀取失敗：' + err.message)
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const confirmDelete = async () => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除這筆點名單嗎？此操作無法復原！`,
      '⚠️ 刪除確認',
      { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error', buttonSize: 'large' }
    )
    
    const { error } = await supabase.from('attendance_events').delete().eq('id', eventId)
    if (error) throw error
    
    ElMessage.success('刪除成功')
    router.push('/attendance')
  } catch (err: any) {
    if (err !== 'cancel') {
      console.error(err)
      ElMessage.error('刪除失敗：' + (err.message || '發生錯誤'))
    }
  }
}

onMounted(() => {
  fetchData()
})

onBeforeUnmount(() => {
  if (pendingChanges.value.size > 0 || syncTimeout.value) {
    if (syncTimeout.value) clearTimeout(syncTimeout.value)
    flushChanges()
  }
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}
</style>
