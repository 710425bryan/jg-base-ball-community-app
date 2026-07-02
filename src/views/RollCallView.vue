<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    
    <!-- Header -->
    <div class="bg-white px-3 py-2 md:px-6 md:py-4 border-b border-gray-200 shadow-sm shrink-0 flex flex-col gap-2 md:gap-3 z-10">
      <!-- Top Row: Title & Actions -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-2 md:gap-4">
        <AppPageHeader
          v-if="eventData"
          :title="eventData.title"
          :icon="Checked"
          as="h2"
          class="roll-call-header"
        >
          <template #before>
            <button @click="router.push('/attendance')" class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors">
              <el-icon><ArrowLeft /></el-icon>
            </button>
          </template>

          <template #subtitle>
            <span class="inline-flex items-center gap-2">
              <span class="text-[10px] md:text-xs font-bold px-2 py-0.5 rounded uppercase tracking-normal bg-gray-100 text-gray-600 border border-gray-200">{{ eventData.event_type }}</span>
              <span class="text-xs md:text-sm font-bold text-gray-500">{{ eventData.date }}</span>
            </span>
          </template>

          <template #actions>
            <div class="flex items-center gap-1.5 md:gap-3 ml-auto md:ml-0">
              <div class="h-8 md:h-auto bg-primary/10 px-2 md:px-3 py-1 md:py-1.5 rounded-lg border border-primary/20 flex items-center gap-1.5 md:gap-2">
                <span class="text-xs font-bold text-gray-500 hidden sm:inline">出席率</span>
                <span class="text-sm font-black text-primary">{{ attendanceRate }}%</span>
              </div>
              <button v-if="canDelete" @click="confirmDelete" class="h-8 min-w-8 px-2 sm:w-auto sm:px-3 md:h-auto md:py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg md:rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5" title="刪除點名單">
                <el-icon><Delete /></el-icon>
                <span class="hidden sm:inline">刪除</span>
              </button>

              <div v-if="hasAccess" class="h-8 md:h-auto flex items-center gap-1.5 md:gap-2 text-sm font-bold bg-gray-50 border border-gray-100 px-2 md:px-3 py-1 md:py-2 rounded-lg md:rounded-xl transition-colors min-w-10 md:min-w-[100px] justify-center">
                <template v-if="isSyncing || pendingChangesSize > 0">
                  <el-icon class="is-loading text-primary"><Loading /></el-icon>
                  <span class="text-primary hidden sm:inline">儲存中</span>
                </template>
                <template v-else>
                  <el-icon class="text-green-500"><Check /></el-icon>
                  <span class="text-green-600 hidden sm:inline">已存檔</span>
                </template>
              </div>
            </div>
          </template>
        </AppPageHeader>

        <div v-else-if="isLoading" class="flex items-center gap-3">
          <button @click="router.push('/attendance')" class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors">
            <el-icon><ArrowLeft /></el-icon>
          </button>
          <span class="text-sm font-bold text-gray-500">讀取點名資料中...</span>
        </div>
      </div>
      
      <!-- Bottom Row: Fixed Search Bar & Filters -->
      <div class="w-full max-w-4xl mx-auto flex flex-col gap-2 md:mt-1 md:gap-3" v-if="!isLoading && playersList.length > 0">
        <!-- Filter Tabs -->
        <div class="roll-call-filter-scroll overflow-x-auto pb-0 md:pb-1">
          <div class="flex gap-1.5 md:gap-2">
            <button
              v-for="filter in rollCallFilters"
              :key="filter"
              @click="activeFilter = filter"
              class="px-3 py-1.5 md:px-4 rounded-full text-xs md:text-sm font-bold whitespace-nowrap transition-all border"
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
          class="roll-call-search w-full shadow-sm"
        />
      </div>
    </div>

    <!-- 點名列表 -->
    <div class="flex-1 overflow-y-auto min-h-0 p-2 md:p-6 pb-2 md:pb-6 relative custom-scrollbar">

      <AppLoadingState v-if="isLoading" text="讀取點名資料中..." min-height="50vh" />

      <div v-else-if="playersList.length === 0 && todayLeaveRows.length === 0" class="flex flex-col justify-center items-center h-full text-gray-400 font-bold">
        未找到任何有效之球員名單
      </div>
      
      <div v-else-if="filteredRollCallPlayers.length === 0 && filteredLeaveRows.length === 0" class="flex flex-col justify-center items-center h-48 text-gray-400 font-bold bg-white rounded-2xl border border-gray-100 max-w-4xl mx-auto">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        找不到符合條件的球員
      </div>

      <div v-else class="max-w-4xl mx-auto space-y-3">
        <div v-if="filteredRollCallPlayers.length > 0" class="flex items-center justify-between px-1">
          <h3 class="text-sm font-black text-slate-700">點名名單</h3>
          <span class="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500 shadow-sm border border-slate-100">{{ filteredRollCallPlayers.length }} 人</span>
        </div>

        <!-- 單一球員點名列 -->
        <div
          v-for="player in filteredRollCallPlayers"
          :key="player.id"
          class="rounded-2xl p-3 md:p-4 border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors bg-white border-gray-100 hover:border-gray-200"
        >
          
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

        <section v-if="filteredLeaveRows.length > 0" class="rounded-2xl border border-blue-100 bg-blue-50/80 p-3 md:p-4 shadow-sm">
          <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 class="text-base font-black text-blue-900">今日請假</h3>
              <p class="mt-1 text-xs font-bold text-blue-600">
                點名日期 {{ eventDateLabel }}，已依請假系統標記為請假，不需點名。
                <span v-if="todayLeaveRows.length !== inRollCallLeaveRows.length">
                  本點名名單內 {{ inRollCallLeaveRows.length }} 人，請假系統共 {{ todayLeaveRows.length }} 人。
                </span>
                <span v-if="todayLeaveRecordCount !== todayLeaveRows.length">
                  假單共 {{ todayLeaveRecordCount }} 筆。
                </span>
              </p>
            </div>
            <span class="w-fit rounded-full bg-white px-3 py-1 text-sm font-black text-blue-600 shadow-sm border border-blue-100">
              {{ filteredLeaveRows.length }} 人
              <template v-if="todayLeaveRecordCount !== todayLeaveRows.length"> / {{ todayLeaveRecordCount }} 筆</template>
            </span>
          </div>

          <div class="mt-3 grid gap-2">
            <div
              v-for="leave in filteredLeaveRows"
              :key="leave.id"
              class="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-white/90 p-3"
            >
              <div class="min-w-0 flex items-center gap-3">
                <div class="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-blue-100 bg-blue-50 flex items-center justify-center text-blue-300">
                  <img v-if="leave.avatar_url" :src="leave.avatar_url" class="h-full w-full object-cover" />
                  <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
                </div>
                <div class="min-w-0">
                  <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span class="truncate text-sm font-black text-slate-800">{{ leave.name }}</span>
                    <span v-if="leave.jersey_number" class="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-500">#{{ leave.jersey_number }}</span>
                  </div>
                  <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-400">
                    <span>{{ leave.role || '未設定身分' }}</span>
                    <span v-if="leave.team_group">／{{ leave.team_group }}</span>
                    <span v-if="!leave.in_roll_call_list" class="text-amber-600">／非本點名名單</span>
                  </div>
                </div>
              </div>
              <span class="shrink-0 rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700">{{ ATTENDANCE_STATUS_LEAVE }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { trainingApi } from '@/services/trainingApi'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { useTeamGroupsStore } from '@/stores/teamGroups'
import {
  ATTENDANCE_STATUS_LEAVE,
  buildAttendanceLeaveSummaryRows,
  getDefaultAttendanceStatusForMember,
  normalizeAttendanceDate,
  normalizeAttendanceMemberId,
  normalizeRollCallStatus
} from '@/utils/attendanceLeave'
import type { AttendanceLeaveSummaryRow } from '@/utils/attendanceLeave'
import { isNoFeeBillingMember } from '@/utils/memberBilling'
import { getTeamGroupSortValue, normalizeTeamGroup } from '@/utils/teamGroups'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Check, Checked, Delete, Loading, Search } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const teamGroupsStore = useTeamGroupsStore()

const eventId = route.params.id as string
const isLoading = ref(true)
const isSyncing = ref(false)

const eventData = ref<any>(null)
const playersList = ref<any[]>([])
const todayLeaveRows = ref<AttendanceLeaveSummaryRow[]>([])
const todayLeaveRecordCount = ref(0)
const searchQuery = ref('')
const activeFilter = ref('全部') // 新增過濾器
const rollCallFilters = computed(() => [
  '全部',
  ...teamGroupsStore.options.map((option) => option.value),
  '校隊'
])

const getRollCallGroupSort = (player: any) => {
  const rawSort = getTeamGroupSortValue(player.team_group, teamGroupsStore.options)
  return rawSort >= Number.MAX_SAFE_INTEGER - 10 ? 9000 : rawSort
}

const getRollCallRoleSort = (role: string | null | undefined) => {
  if (role === '球員') return 0
  if (role === '校隊') return 1
  return 2
}

const getRollCallSortValues = (row: any) => ({
  groupSort: getRollCallGroupSort(row),
  roleSort: getRollCallRoleSort(row.role),
  name: String(row.name || '')
})

const compareRollCallPlayers = (left: any, right: any) => {
  if (left.hasOverlapLeave !== right.hasOverlapLeave) {
    return left.hasOverlapLeave ? 1 : -1
  }

  return compareRollCallRows(left, right)
}

const compareRollCallRows = (left: any, right: any) => {
  const leftSort = getRollCallSortValues(left)
  const rightSort = getRollCallSortValues(right)

  const groupSort = leftSort.groupSort - rightSort.groupSort
  if (groupSort !== 0) return groupSort

  const roleSort = leftSort.roleSort - rightSort.roleSort
  if (roleSort !== 0) return roleSort

  return leftSort.name.localeCompare(rightSort.name, 'zh-TW')
}

const applyRollCallFilters = <T extends {
  name?: string | null
  jersey_number?: string | number | null
  role?: string | null
  team_group?: string | null
}>(rows: T[]) => {
  let result = rows

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
}

const filteredRollCallPlayers = computed(() =>
  [...applyRollCallFilters(playersList.value.filter((player) => !player.hasOverlapLeave))]
    .sort(compareRollCallPlayers)
)

const filteredLeaveRows = computed(() =>
  [...applyRollCallFilters(todayLeaveRows.value)]
    .sort(compareRollCallRows)
)

const inRollCallLeaveRows = computed(() =>
  todayLeaveRows.value.filter((row) => row.in_roll_call_list)
)

const eventDateLabel = computed(() =>
  normalizeAttendanceDate(eventData.value?.date) || '未設定日期'
)

const isTrainingEvent = computed(() => Boolean(eventData.value?.training_session_id))
const hasAccess = computed(() =>
  permissionsStore.can('attendance', 'EDIT') ||
  (isTrainingEvent.value && permissionsStore.can('training', 'EDIT'))
)
const canDelete = computed(() =>
  permissionsStore.can('attendance', 'DELETE') ||
  (isTrainingEvent.value && permissionsStore.can('training', 'DELETE'))
)

const statusOptions = computed(() => [
  // Detail 頁不提供缺席操作；缺席 / 禁報需走明確管理流程。
  { label: '出席', value: '出席', bgClass: 'bg-green-50', textClass: 'text-green-600', icon: '✅' },
  { label: ATTENDANCE_STATUS_LEAVE, value: ATTENDANCE_STATUS_LEAVE, bgClass: 'bg-blue-50', textClass: 'text-blue-500', icon: '🏖️' }
])

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

    if (isTrainingEvent.value) {
      await Promise.all(entriesToSync.map(([memberId, status]) =>
        trainingApi.applyAttendanceResult(eventId, memberId, status)
      ))
    }
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
  todayLeaveRows.value = []
  todayLeaveRecordCount.value = 0
  try {
    // 1. 取得 Event 資料
    const { data: evData, error: evError } = await supabase
      .from('attendance_events')
      .select('*')
      .eq('id', eventId)
      .single()
      
    if (evError) throw evError
    const eventDate = normalizeAttendanceDate(evData.date)
    eventData.value = {
      ...evData,
      date: eventDate || evData.date
    }

    // 2. 取得球員。特訓點名只列錄取名單；場地點名列最新場地配置中的該場地；一般點名列所有現役球員/校隊。
    let membersData: any[] = []
    if (evData.training_session_id) {
      const { data: registrations, error: registrationError } = await supabase
        .from('training_registrations')
        .select('member_id')
        .eq('session_id', evData.training_session_id)
        .eq('status', 'selected')

      if (registrationError) throw registrationError

      const memberIds = (registrations || []).map((registration: any) => registration.member_id).filter(Boolean)
      if (memberIds.length > 0) {
        const { data: selectedMembers, error: selectedMemberError } = await supabase
          .from('team_members_safe')
          .select('id, name, avatar_url, role, jersey_number, status, team_group, fee_billing_mode')
          .in('id', memberIds)
          .order('name')

        if (selectedMemberError) throw selectedMemberError
        membersData = selectedMembers || []
      }
    } else if (evData.training_location_session_venue_id || evData.training_location_session_id) {
      const { data: locationMembers, error: locationMemberError } = await supabase
        .rpc('list_training_location_attendance_members', {
          p_event_id: eventId
        })

      if (locationMemberError) throw locationMemberError
      membersData = locationMembers || []
    } else {
      const { data: allMembers, error: memberError } = await supabase
        .from('team_members')
        .select('id, name, avatar_url, role, jersey_number, status, team_group, fee_billing_mode')
        .in('role', ['球員', '校隊'])
        .order('name')

      if (memberError) throw memberError
      membersData = allMembers || []
    }

    // 3. 取得當天所有請假名單，並標記哪些人在本點名名單內。
    const { data: leavesData, error: leaveError } = await supabase
      .from('leave_requests')
      .select(`
        id, user_id, leave_type, start_date, end_date, reason,
        team_members ( id, name, avatar_url, role, jersey_number, status, team_group )
      `)
      .lte('start_date', eventDate)
      .gte('end_date', eventDate)

    if (leaveError) throw leaveError

    todayLeaveRecordCount.value = Array.isArray(leavesData) ? leavesData.length : 0
    todayLeaveRows.value = buildAttendanceLeaveSummaryRows(leavesData, membersData)
      .map((row) => ({
        ...row,
        team_group: normalizeTeamGroup(row.team_group)
      }))
    const leaveMemberIds = new Set(
      todayLeaveRows.value
        .filter((row) => row.in_roll_call_list)
        .map((row) => row.member_id)
        .filter(Boolean)
    )

    // 4. 取得已儲存的點名紀錄
    const { data: recordsData, error: recordError } = await supabase
      .from('attendance_records')
      .select('member_id, status')
      .eq('event_id', eventId)
      
    if (recordError) throw recordError
    const recordMap = new Map(recordsData?.map(r => [
      normalizeAttendanceMemberId(r.member_id),
      normalizeRollCallStatus(r.status)
    ]))

    // 5. 組裝最終 List
    // 過濾掉退隊人員，但若該人員在此點名單已有紀錄（歷史紀錄），則保留顯示
    const activeMembers = membersData?.filter(m =>
      (m.status !== '退隊' && !isNoFeeBillingMember(m)) || recordMap.has(normalizeAttendanceMemberId(m.id))
    ) || []
    
    // 收集需要寫回預設狀態的球員，稍後於背景自動補齊。
    const defaultStatusSyncs: Array<{member_id: string, status: string}> = []

    playersList.value = activeMembers.map(m => {
      const memberId = normalizeAttendanceMemberId(m.id)
      let status = recordMap.get(memberId)
      const hasOverlapLeave = leaveMemberIds.has(memberId)
      const shouldPrefillDefault = !status
      
      if (!status) {
        // 沒有紀錄時，畫面先預設為請假；使用者只需要把到場球員改成出席。
        status = getDefaultAttendanceStatusForMember(memberId, leaveMemberIds, ATTENDANCE_STATUS_LEAVE)
        if (shouldPrefillDefault) {
          defaultStatusSyncs.push({ member_id: memberId, status })
        }
      }
      
      return {
        ...m,
        team_group: normalizeTeamGroup(m.team_group),
        status,
        hasOverlapLeave
      }
    }) || []

    // 背景非同步自動補齊缺漏的預設點名紀錄，避免沒點到的人在統計時不算數。
    if (defaultStatusSyncs.length > 0) {
      const payloads = defaultStatusSyncs.map(u => ({
        event_id: eventId,
        member_id: u.member_id,
        status: u.status
      }))
      supabase.from('attendance_records')
        .upsert(payloads, { onConflict: 'event_id,member_id' })
        .then(({ error }) => {
          if (error) console.error("Auto sync missing records failed:", error)
        })
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
  void teamGroupsStore.loadGroups().catch((error: any) => {
    console.warn('Failed to load team group settings:', error)
  })
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
@media (max-width: 767px) {
  .roll-call-header {
    align-items: center;
    flex-direction: row;
    gap: 0.5rem;
  }

  .roll-call-header :deep(.app-page-header-main) {
    align-items: center;
    flex: 1 1 auto;
    flex-direction: row;
    gap: 0.5rem;
    min-width: 0;
  }

  .roll-call-header :deep(.app-page-heading) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .roll-call-header :deep(.app-page-title) {
    flex-wrap: nowrap;
    font-size: 1rem;
    gap: 0.35rem;
    line-height: 1.2;
  }

  .roll-call-header :deep(.app-page-title-icon) {
    font-size: 0.95rem;
  }

  .roll-call-header :deep(.app-page-title-text) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .roll-call-header :deep(.app-page-subtitle) {
    margin-top: 0.125rem;
  }

  .roll-call-header :deep(.app-page-header-actions) {
    flex: 0 0 auto;
    flex-wrap: nowrap;
    gap: 0.375rem;
    width: auto;
  }

  .roll-call-search :deep(.el-input__wrapper) {
    min-height: 34px;
  }

  .roll-call-search :deep(.el-input__inner) {
    height: 32px;
    font-size: 0.8125rem;
  }
}

.roll-call-filter-scroll {
  scrollbar-width: none;
}

.roll-call-filter-scroll::-webkit-scrollbar {
  display: none;
}

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
