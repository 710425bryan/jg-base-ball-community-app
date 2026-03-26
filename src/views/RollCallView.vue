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
        <button v-if="hasAccess" @click="saveAttendance" :disabled="isSaving" class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-5 py-2.5 rounded-xl shadow-[0_4px_10px_rgba(216,143,34,0.3)] text-sm font-bold transition-all flex items-center gap-2 tracking-wide disabled:opacity-70">
          <el-icon v-if="isSaving" class="is-loading"><Loading /></el-icon>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
          <span class="hidden sm:inline">儲存點名結果</span>
          <span class="sm:hidden">儲存</span>
        </button>
      </div>
      </div>
      
      <!-- Bottom Row: Fixed Search Bar -->
      <div class="w-full max-w-4xl mx-auto mt-1" v-if="!isLoading && playersList.length > 0">
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
    <div class="flex-1 overflow-y-auto min-h-0 p-2 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 relative custom-scrollbar" v-loading="isLoading">

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
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'
import { Loading, Search } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const hasAccess = computed(() => ['ADMIN', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role))

const eventId = route.params.id as string
const isLoading = ref(true)
const isSaving = ref(false)

const eventData = ref<any>(null)
// playersList 架構: { id, name, avatar_url, role, status: '缺席'..., hasOverlapLeave: boolean }
const playersList = ref<any[]>([])
const searchQuery = ref('')

const filteredPlayers = computed(() => {
  if (!searchQuery.value) return playersList.value
  const q = searchQuery.value.toLowerCase().trim()
  return playersList.value.filter(p => 
    (p.name && p.name.toLowerCase().includes(q)) || 
    (p.jersey_number && String(p.jersey_number).includes(q))
  )
})

const statusOptions = [
  { label: '出席', value: '出席', bgClass: 'bg-green-50', textClass: 'text-green-600', icon: '✅' },
  { label: '遲到', value: '遲到', bgClass: 'bg-yellow-50', textClass: 'text-yellow-600', icon: '⚠️' },
  { label: '早退', value: '早退', bgClass: 'bg-orange-50', textClass: 'text-orange-500', icon: '🏃' },
  { label: '缺席', value: '缺席', bgClass: 'bg-red-50', textClass: 'text-red-500', icon: '❌' },
  { label: '請假', value: '請假', bgClass: 'bg-blue-50', textClass: 'text-blue-500', icon: '🏖️' }
]

// 計算出席率 (出席 人數 / 總人數，扣除請假?)
// 一般計算: 出席 + 遲到 + 早退 都算有來
const attendanceRate = computed(() => {
  if (playersList.value.length === 0) return 0
  const presentCount = playersList.value.filter(p => ['出席', '遲到', '早退'].includes(p.status)).length
  // 若想扣掉請假的基數可調整分母: const baseCount = playersList.value.filter(p => p.status !== '請假').length || 1
  const baseCount = playersList.value.length
  return Math.round((presentCount / baseCount) * 100)
})

const setPlayerStatus = (playerId: string, status: string) => {
  const p = playersList.value.find(x => x.id === playerId)
  if (p) p.status = status
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
      .select('id, name, avatar_url, role, jersey_number')
      // 理論上若資料有其他身份可過濾 .eq('role', '球員')，這裡抓所有「球員」
      .eq('role', '球員')
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
    playersList.value = membersData?.map(m => {
      let status = recordMap.get(m.id)
      const hasOverlapLeave = leaveNames.includes(m.name)
      
      if (!status) {
        // 沒有點名紀錄時，判斷是否請假預設
        status = hasOverlapLeave ? '請假' : '缺席' // 預設缺席或是其他
      }
      
      return {
        ...m,
        status,
        hasOverlapLeave
      }
    }) || []

  } catch (err: any) {
    ElMessage.error('資料讀取失敗：' + err.message)
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const saveAttendance = async () => {
  isSaving.value = true
  try {
    const payloads = playersList.value.map(p => ({
      event_id: eventId,
      member_id: p.id,
      status: p.status
    }))
    
    const { error } = await supabase
      .from('attendance_records')
      .upsert(payloads, { onConflict: 'event_id,member_id' })
      
    if (error) throw error
    
    ElMessage.success('儲存成功！')
  } catch (err: any) {
    ElMessage.error('儲存失敗：' + err.message)
    console.error(err)
  } finally {
    isSaving.value = false
  }
}

onMounted(() => {
  fetchData()
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
