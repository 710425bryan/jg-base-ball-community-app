<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-20 md:pb-6">
    <!-- 頂部標題區 -->
    <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4 shrink-0">
      <div>
        <h2 class="text-3xl font-extrabold text-gray-800 tracking-tight flex items-center gap-2">
          出缺勤管理
        </h2>
        <p class="text-gray-500 font-medium text-sm mt-1">管理各級球員與教練的請假紀錄、統計與月曆，請假將自動生效。</p>
      </div>

      <div class="flex items-center gap-3">
        <!-- 齒輪按鈕 (預留設定推播用) -->
        <button class="bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 p-2.5 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>
        </button>

        <button @click="openCreateModal" class="bg-orange-600 hover:bg-orange-700 active:scale-95 text-white px-5 py-2.5 rounded-xl shadow-[0_8px_20px_rgb(234,88,12,0.25)] text-sm font-bold transition-all flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          新增假單
        </button>
      </div>
    </div>

    <!-- 頁籤與內容區塊 -->
    <div class="flex-1 flex flex-col min-h-0 custom-tabs-container">
      <el-tabs v-model="activeTab" class="w-full h-full flex flex-col">
        <!-- 1. 月曆視圖 -->
        <el-tab-pane name="calendar" class="h-full flex flex-col">
          <template #label><div class="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" /></svg>月曆視圖</div></template>
          <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 p-2 sm:p-4 flex-1 flex flex-col min-h-0 overflow-y-auto">
            <el-calendar v-model="calendarDate" class="custom-calendar">
              <template #date-cell="{ data }">
                <div class="w-full h-full flex flex-col p-1">
                  <span class="text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1" :class="data.isSelected ? 'bg-orange-500 text-white' : 'text-gray-700'">{{ data.day.split('-').slice(2).join('') }}</span>
                  <div class="flex flex-col gap-1 flex-1 overflow-y-auto custom-scrollbar relative z-10">
                    <template v-for="leave in getLeavesForDate(data.day)" :key="leave.id">
                      <div class="text-[10px] sm:text-xs leading-tight px-1 py-0.5 rounded sm:rounded-md shadow-sm border truncate font-bold flex items-center justify-between gap-0.5"
                           :class="getLeaveBadgeClass(leave.leave_type)">
                        <span class="truncate">{{ leave.profiles?.name || '未知' }}</span>
                        <span class="opacity-75 shrink-0 scale-75 sm:scale-100 origin-right">({{ leave.leave_type.slice(0,1) }})</span>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
            </el-calendar>
          </div>
        </el-tab-pane>

        <!-- 2. 詳細列表 -->
        <el-tab-pane name="list" class="h-full flex flex-col">
          <template #label><div class="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd" /></svg>詳細列表</div></template>
          <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 flex flex-col min-h-0">
             
            <!-- 篩選列 -->
            <div class="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="開始日期"
                end-placeholder="結束日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                @change="fetchData"
                class="!w-full sm:!w-[300px]"
              />
            </div>

            <!-- 列表 -->
            <el-table 
              :data="leaveRequests" 
              style="width: 100%; height: 100%" 
              height="100%"
              v-loading="isLoading" 
              empty-text="目前沒有請假紀錄"
              row-class-name="transition-colors hover:bg-orange-50/30"
              header-cell-class-name="bg-gray-50/50 text-gray-500 font-bold"
            >
              <el-table-column label="日期" min-width="120">
                <template #default="{ row }">
                  <span class="font-bold text-gray-700">{{ row.start_date === row.end_date ? row.start_date : `${row.start_date.slice(5)} ~ ${row.end_date.slice(5)}` }}</span>
                </template>
              </el-table-column>
              
              <el-table-column label="球員" min-width="160">
                <template #default="{ row }">
                  <div class="flex items-center gap-3 py-1">
                    <div class="w-8 h-8 rounded-full overflow-hidden bg-gray-100 shrink-0">
                      <img v-if="row.profiles?.avatar_url" :src="row.profiles.avatar_url" class="w-full h-full object-cover" />
                      <div v-else class="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xs">
                        {{ row.profiles?.name?.charAt(0) || '?' }}
                      </div>
                    </div>
                    <div class="flex flex-col">
                      <span class="font-bold text-gray-800">{{ row.profiles?.name || '未知使用者' }}</span>
                      <span v-if="row.profiles?.nickname" class="text-xs text-gray-400">{{ row.profiles.nickname }}</span>
                    </div>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="假別" width="80">
                <template #default="{ row }">
                  <span class="bg-orange-50 text-orange-600 px-2.5 py-1 rounded-md text-xs font-bold border border-orange-100">
                    {{ row.leave_type }}
                  </span>
                </template>
              </el-table-column>

              <el-table-column prop="reason" label="原因" min-width="180">
                <template #default="{ row }">
                  <span class="text-gray-500 text-sm truncate block">{{ row.reason || '無說明' }}</span>
                </template>
              </el-table-column>

              <el-table-column label="操作" width="60" align="right" fixed="right">
                <template #default="{ row }">
                  <!-- 只有自己或是管理員可以刪除 -->
                   <button v-if="row.user_id === authStore.user?.id || isAdminOrManager" @click="confirmDelete(row)" class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="刪除紀錄">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- 3. 統計報表 -->
        <el-tab-pane name="stats" class="h-full flex flex-col">
          <template #label><div class="flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>統計報表</div></template>
          <div class="h-full flex flex-col min-h-0 space-y-4 pt-4">
            
            <!-- 統計區間篩選 -->
            <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span class="font-extrabold text-gray-800 block">統計區間</span>
                <span class="text-xs text-gray-400">選擇日期範圍來統計球員請假次數</span>
              </div>
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="開始日期"
                end-placeholder="結束日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                @change="fetchData"
                class="!w-full sm:!w-[400px]"
              />
            </div>

            <!-- 五大數據卡片 -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center col-span-2 md:col-span-1">
                <span class="text-gray-500 font-bold text-sm mb-1">總請假次數</span>
                <span class="text-4xl font-extrabold text-gray-800">{{ statsByType.總數 }}</span>
              </div>
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center">
                <span class="text-gray-500 font-bold text-sm mb-1">事假</span>
                <span class="text-3xl font-extrabold text-orange-500">{{ statsByType.事假 }}</span>
              </div>
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center">
                <span class="text-gray-500 font-bold text-sm mb-1">病假</span>
                <span class="text-3xl font-extrabold text-red-500">{{ statsByType.病假 }}</span>
              </div>
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center">
                <span class="text-gray-500 font-bold text-sm mb-1">公假</span>
                <span class="text-3xl font-extrabold text-blue-500">{{ statsByType.公假 }}</span>
              </div>
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center">
                <span class="text-gray-500 font-bold text-sm mb-1">其他</span>
                <span class="text-3xl font-extrabold text-gray-500">{{ statsByType.其他 }}</span>
              </div>
            </div>

            <!-- 排行榜列表 -->
            <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 flex-1 flex flex-col min-h-0 overflow-hidden">
              <div class="p-5 border-b border-gray-100 bg-gray-50/30">
                <h3 class="font-bold text-gray-800">球員請假排行榜 (由多到少)</h3>
              </div>
              <el-table 
                :data="rankingByPlayer" 
                style="width: 100%; height: 100%" 
                height="100%"
                row-class-name="transition-colors hover:bg-gray-50/50"
                header-cell-class-name="bg-white text-gray-400 font-medium text-xs"
              >
                <el-table-column label="球員" min-width="200">
                  <template #default="{ row }">
                    <div class="flex items-center gap-3">
                      <div class="w-8 h-8 rounded-full overflow-hidden bg-gray-100 shrink-0">
                        <img v-if="row.avatar_url" :src="row.avatar_url" class="w-full h-full object-cover" />
                        <div v-else class="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xs">{{ row.name.charAt(0) }}</div>
                      </div>
                      <span class="font-bold text-gray-700">{{ row.name }} <span v-if="row.nickname" class="text-xs text-gray-400 font-normal">({{ row.nickname }})</span></span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="total" label="總次數" width="120" align="center">
                  <template #default="{ row }">
                    <span class="font-extrabold text-gray-800 text-lg">{{ row.total }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="假別分佈" min-width="300">
                  <template #default="{ row }">
                    <div class="flex flex-wrap gap-2">
                       <span v-if="row.types.事假 > 0" class="bg-orange-50 text-orange-600 px-2 py-0.5 rounded text-xs font-bold border border-orange-100">事假: {{ row.types.事假 }}</span>
                       <span v-if="row.types.病假 > 0" class="bg-red-50 text-red-600 px-2 py-0.5 rounded text-xs font-bold border border-red-100">病假: {{ row.types.病假 }}</span>
                       <span v-if="row.types.公假 > 0" class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-xs font-bold border border-blue-100">公假: {{ row.types.公假 }}</span>
                       <span v-if="row.types.其他 > 0" class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-bold border border-gray-200">其他: {{ row.types.其他 }}</span>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 假單表單 Modal -->
    <el-dialog
      v-model="isModalOpen"
      title="新增假單"
      width="90%"
      style="max-width: 500px; border-radius: 16px;"
      :show-close="false"
      class="custom-dialog"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" class="mt-4 space-y-4">
        
        <!-- 當是管理員代為請假時，可選擇球員 -->
        <el-form-item v-if="isAdminOrManager" label="請假球員 (代填)" prop="user_id" class="font-bold">
          <el-select v-model="form.user_id" placeholder="請選擇要請假的人員" size="large" class="w-full" filterable>
            <el-option v-for="p in profiles" :key="p.id" :label="`${p.name} ${p.nickname ? '('+p.nickname+')' : ''}`" :value="p.id" />
          </el-select>
        </el-form-item>

        <div class="flex gap-4 w-full flex-col sm:flex-row">
          <el-form-item label="請假類別" prop="leave_type" class="font-bold flex-1">
            <el-select v-model="form.leave_type" size="large" class="w-full">
              <el-option label="事假" value="事假" />
              <el-option label="病假" value="病假" />
              <el-option label="公假" value="公假" />
              <el-option label="其他" value="其他" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="請假日期區間" prop="date_range" class="font-bold">
          <el-date-picker
            v-model="form.date_range"
            type="daterange"
            range-separator="至"
            start-placeholder="開始日期"
            end-placeholder="結束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            size="large"
            class="!w-full"
          />
        </el-form-item>

        <el-form-item label="請假原因說明" prop="reason" class="font-bold">
          <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="請簡述請假事由 (選填)" />
          <p class="text-xs text-gray-400 font-normal mt-1 w-full">假單送出後將自動生效並加入出缺勤紀錄中。</p>
        </el-form-item>

      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button @click="isModalOpen = false" class="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">取消</button>
          <button @click="submitForm" :disabled="isSubmitting" class="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-lg shadow-orange-200 transition-all flex items-center justify-center min-w-[100px]">
            <span v-if="isSubmitting" class="flex gap-2 items-center"><el-icon class="is-loading"><Loading /></el-icon> 送出假單</span>
            <span v-else>確認送出</span>
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const authStore = useAuthStore()
const activeTab = ref('list')
const isModalOpen = ref(false)

// --- 資料狀態 ---
const leaveRequests = ref<any[]>([])
const profiles = ref<any[]>([])
const isLoading = ref(true)
const isSubmitting = ref(false)
const formRef = ref()

// --- 篩選區間 ---
const defaultStartDate = dayjs().startOf('year').format('YYYY-MM-DD')
const defaultEndDate = dayjs().endOf('year').format('YYYY-MM-DD')
const dateRange = ref<[string, string]>([defaultStartDate, defaultEndDate])

// --- 表單狀態 ---
const form = reactive({
  user_id: '',
  leave_type: '事假',
  date_range: ['', ''] as [string, string],
  reason: ''
})

const rules = {
  user_id: [{ required: true, message: '請選擇請假人員', trigger: 'change' }],
  leave_type: [{ required: true, message: '請選擇假別', trigger: 'change' }],
  date_range: [{ required: true, message: '請選擇請假日期區間', trigger: 'change' }]
}

// --- 權限判斷 ---
const isAdminOrManager = computed(() => {
  const role = authStore.profile?.role
  return role === 'ADMIN' || role === 'MANAGER' || role === 'HEAD_COACH'
})

// --- 月曆邏輯 ---
const calendarDate = ref(new Date())

const getLeavesForDate = (dateStr: string) => {
  return leaveRequests.value.filter(leave => {
    return dateStr >= leave.start_date && dateStr <= leave.end_date
  })
}

const getLeaveBadgeClass = (type: string) => {
  switch (type) {
    case '事假': return 'bg-orange-50 text-orange-600 border-orange-100'
    case '病假': return 'bg-red-50 text-red-600 border-red-100'
    case '公假': return 'bg-blue-50 text-blue-600 border-blue-100'
    default: return 'bg-gray-50 text-gray-600 border-gray-200'
  }
}

// --- 統計邏輯 ---
const statsByType = computed(() => {
  let stats: Record<string, number> = { 事假: 0, 病假: 0, 公假: 0, 其他: 0, 總數: leaveRequests.value.length }
  for (const r of leaveRequests.value) {
    if (r.leave_type in stats) {
      stats[r.leave_type]++
    } else {
      stats['其他']++
    }
  }
  return stats
})

const rankingByPlayer = computed(() => {
  const map: Record<string, any> = {}
  leaveRequests.value.forEach(r => {
    const pId = r.user_id
    if (!map[pId]) {
      map[pId] = {
        name: r.profiles?.name || '未知',
        nickname: r.profiles?.nickname,
        avatar_url: r.profiles?.avatar_url,
        total: 0,
        types: { 事假: 0, 病假: 0, 公假: 0, 其他: 0 }
      }
    }
    map[pId].total++
    if (r.leave_type in map[pId].types) {
      map[pId].types[r.leave_type]++
    } else {
      map[pId].types.其他++
    }
  })
  return Object.values(map).sort((a, b) => b.total - a.total)
})

// --- 讀取資料 ---
const fetchData = async () => {
  isLoading.value = true
  try {
    // 1. 撈取使用者名單 (給下拉選單用)
    if (profiles.value.length === 0) {
      const { data: pData } = await supabase.from('profiles').select('id, name, nickname, avatar_url').order('name')
      profiles.value = pData || []
    }

    // 2. 撈取請假紀錄
    const [start, end] = dateRange.value || [null, null]
    let query = supabase
      .from('leave_requests')
      .select(`
        id, user_id, leave_type, start_date, end_date, reason, created_at,
        profiles ( name, nickname, avatar_url )
      `)
      .order('start_date', { ascending: false })

    if (start && end) {
      query = query.gte('start_date', start).lte('end_date', end)
    }

    const { data, error } = await query
    if (error) throw error
    
    leaveRequests.value = data || []
  } catch (error: any) {
    ElMessage.error('資料讀取失敗：' + error.message)
  } finally {
    isLoading.value = false
  }
}

// --- 表單操作 ---
const openCreateModal = () => {
  form.user_id = isAdminOrManager.value ? '' : authStore.user?.id || ''
  form.leave_type = '事假'
  form.date_range = [dayjs().format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
  form.reason = ''
  if(formRef.value) formRef.value.clearValidate()
  isModalOpen.value = true
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    isSubmitting.value = true
    try {
      const { error } = await supabase.from('leave_requests').insert({
        user_id: form.user_id,
        leave_type: form.leave_type,
        start_date: form.date_range[0],
        end_date: form.date_range[1],
        reason: form.reason || null
      })

      if (error) throw error
      
      ElMessage.success('新增假單成功！')
      isModalOpen.value = false
      fetchData()
    } catch (error: any) {
      ElMessage.error('新增失敗：' + error.message)
    } finally {
      isSubmitting.value = false
    }
  })
}

// --- 刪除操作 ---
const confirmDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆請假紀錄嗎？', '⚠️ 刪除確認', {
      confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error'
    })
    
    const { error } = await supabase.from('leave_requests').delete().eq('id', row.id)
    if (error) throw error
    
    ElMessage.success('刪除成功')
    fetchData()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error('刪除失敗：' + err.message)
  }
}

// --- 初始掛載 ---
onMounted(() => {
  fetchData()
})
</script>

<style>
/* Tab 標籤客製化 */
.custom-tabs-container .el-tabs__item {
  font-size: 1rem;
  font-weight: 700;
  color: #9ca3af;
  padding: 0 20px;
  height: 50px;
  transition: all 0.3s ease;
}
.custom-tabs-container .el-tabs__item.is-active {
  color: #ea580c;
}
.custom-tabs-container .el-tabs__active-bar {
  background-color: #ea580c;
  height: 3px;
  border-radius: 3px;
}
.custom-tabs-container .el-tabs__nav-wrap::after {
  height: 1px;
  background-color: #f3f4f6;
}
/* 讓 Tab 內容區塊自動延伸填滿 */
.custom-tabs-container .el-tabs__content {
  flex-grow: 1;
  padding: 16px 0 0 0;
}
/* 客製化 Dialog 圓角與標題 */
.custom-dialog .el-dialog__header {
  border-bottom: 1px solid #f3f4f6;
  margin-right: 0;
  padding: 24px;
}
.custom-dialog .el-dialog__title {
  font-weight: 800;
  color: #1f2937;
  font-size: 1.25rem;
}
.custom-dialog .el-dialog__body {
  padding: 16px 24px 0px 24px;
}

/* 客製化月曆樣式 */
.custom-calendar {
  --el-calendar-cell-width: auto;
}
.custom-calendar .el-calendar__body {
  padding: 12px 20px 20px;
}
.custom-calendar .el-calendar-table .el-calendar-day {
  height: 100px;
  padding: 4px;
}
@media (min-width: 640px) {
  .custom-calendar .el-calendar-table .el-calendar-day {
    height: 120px;
  }
}
.custom-calendar .el-calendar-table td.is-selected {
  background-color: transparent;
}
.custom-calendar .el-calendar-table td.is-today {
  color: inherit;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 4px;
}
</style>
