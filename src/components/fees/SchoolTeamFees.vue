<template>
  <div class="flex flex-col gap-6 animate-fade-in pt-2">
    <!-- Filters and Actions -->
    <div class="bg-white p-5 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-4 lg:gap-8 items-start lg:items-end justify-between">
      
      <!-- 左側：篩選與設定工具區 -->
      <div class="w-full lg:w-auto flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-end">
      <div class="w-full sm:w-auto flex flex-col gap-1.5">
        <label class="text-xs font-bold text-gray-500">結算月份</label>
        <el-date-picker
          v-model="selectedMonth"
          type="month"
          value-format="YYYY-MM"
          placeholder="選擇月份"
          class="!w-full sm:!w-40"
          size="large"
          @change="onMonthChange"
          :clearable="false"
        />
      </div>

      <!-- 本月上課日期選取 -->
      <div class="w-full sm:w-auto flex flex-col gap-1.5 border-l-0 sm:border-l border-gray-200 pl-0 sm:pl-4">
        <label class="text-xs font-bold text-gray-500">本月上課日期 (可複選)</label>
        <div class="flex gap-2 items-center">
          <el-date-picker
            v-model="classDates"
            type="dates"
            value-format="YYYY-MM-DD"
            placeholder="選擇上課日期"
            class="!w-full sm:!w-64"
            size="large"
            @change="fetchData"
            :clearable="false"
            :disabled-date="disabledDate"
          />
        </div>
      </div>
      </div>

      <!-- 右側：動作按鈕區 -->
      <div class="w-full lg:w-auto flex flex-col sm:flex-row gap-2 mt-2 lg:mt-0 justify-end flex-shrink-0">
        <button 
          @click="exportCSV" 
          :disabled="isLoading || feesList.length === 0"
          class="w-full sm:w-auto bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          匯出 CSV 報表
        </button>
        <button 
          @click="calculateFees" 
          :disabled="isLoading"
          class="w-full sm:w-auto bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <el-icon v-if="isCalculating" class="is-loading"><Loading /></el-icon>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
          試算本月
        </button>
        <button 
          @click="saveAll" 
          :disabled="isLoading || feesList.length === 0 || !hasChanges"
          class="w-full sm:w-auto bg-green-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
          一鍵存檔 <span v-if="hasChanges">({{ pendingChanges.length }})</span>
        </button>
      </div>
    </div>

    <!-- 收到的匯款回報區塊 (精簡橫幅) -->
    <div class="bg-blue-50 border border-blue-100 rounded-2xl p-4 md:p-5 shadow-sm mb-2 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <el-icon class="text-blue-500 text-3xl shrink-0"><BellFilled /></el-icon>
        <div>
          <h3 class="text-blue-800 font-bold text-base">近期收到 {{ schoolTeamRemittances.length }} 筆校隊匯款回報</h3>
          <p class="text-blue-600/80 text-[10px] sm:text-xs mt-0.5">點擊查看詳情，並在下方列表將其切換為「已繳」</p>
        </div>
      </div>
      <button 
        @click="drawerVisible = true" 
        :disabled="schoolTeamRemittances.length === 0"
        :class="[
          'w-full sm:w-auto font-bold py-2.5 px-6 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 shrink-0',
          schoolTeamRemittances.length === 0 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 active:scale-95 text-white'
        ]"
      >
        查看並處理回報 <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
      </button>
    </div>

    <!-- 匯款回報處理抽屜 -->
    <el-drawer v-model="drawerVisible" title="校隊最新匯款回報" :size="drawerSize" class="!rounded-l-2xl">
      <div class="flex flex-col gap-4">
        <div v-for="r in schoolTeamRemittances" :key="r.id" class="bg-gray-50 border border-gray-100 rounded-xl p-4 relative group overflow-hidden shadow-sm">
          <div class="absolute top-0 right-0 h-full w-1.5 bg-gradient-to-b from-blue-300 to-blue-500"></div>
          
          <div class="flex justify-between items-center pr-2 mb-2">
            <span class="font-black text-gray-800 text-lg">{{ r.member_names }}</span>
            <span class="text-blue-600 font-mono font-bold text-lg bg-blue-50 px-2 py-0.5 rounded">${{ r.amount }}</span>
          </div>

          <div class="text-sm text-gray-500 flex flex-wrap items-center justify-between gap-y-1 mb-2">
            <span class="flex items-center gap-1.5 text-gray-600 font-bold"><el-icon><Calendar /></el-icon> {{ r.remittance_date || '-' }}</span>
            <div class="flex gap-1">
              <span v-if="r.account_last_5" class="bg-gray-100/80 text-gray-600 border border-gray-200 rounded px-2 py-0.5 font-mono text-xs">末五碼: <span class="text-gray-800 font-bold">{{ r.account_last_5 }}</span></span>
              <span v-if="r.payment_method" class="bg-blue-50 text-blue-600 border border-blue-100 rounded px-2 py-0.5 font-bold text-xs">{{ r.payment_method }}</span>
            </div>
          </div>
          
          <div v-if="r.payment_items && r.payment_items.length" class="flex flex-wrap gap-1 mb-3">
            <span v-for="item in r.payment_items" :key="item" class="text-[10px] bg-indigo-50 text-indigo-500 border border-indigo-100 px-1.5 py-0.5 rounded truncate max-w-full font-bold">
              {{ item }}
            </span>
          </div>

          <div class="flex items-center justify-between mt-auto pt-3 border-t border-gray-200/60">
             <div class="text-[10px] text-gray-400">填寫於 {{ formatTimestamp(r.created_at) }}</div>
             <div class="flex gap-2">
               <button @click="markAsPaid(r)" class="flex items-center gap-1 text-xs text-green-600 font-bold hover:bg-green-100 hover:text-green-700 px-2.5 py-1.5 rounded transition-colors bg-green-50 shadow-sm border border-green-200/50">
                 <el-icon><Check /></el-icon> 確認款項
               </button>
               <button @click="openEditDialog(r)" class="flex items-center justify-center text-blue-500 font-bold hover:bg-blue-100 w-7 h-7 rounded transition-colors bg-blue-50">
                 <el-icon><Edit /></el-icon>
               </button>
               <button @click="handleDeleteRemittance(r.id)" class="flex items-center justify-center text-red-500 font-bold hover:bg-red-100 w-7 h-7 rounded transition-colors bg-red-50">
                 <el-icon><Delete /></el-icon>
               </button>
             </div>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 編輯匯款回報彈窗 -->
    <el-dialog v-model="editDialogVisible" title="編輯匯款單" width="90%" class="max-w-md !rounded-2xl" append-to-body>
      <div class="flex flex-col gap-5 pt-2">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-bold text-gray-700">匯款金額</label>
          <el-input-number v-model="editForm.amount" class="!w-full" :min="0" :step="100" size="large" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-bold text-gray-700">匯款日期</label>
          <el-date-picker v-model="editForm.remittance_date" type="date" value-format="YYYY-MM-DD" class="!w-full" size="large" />
        </div>
        <div class="flex gap-4">
          <div class="flex flex-col gap-1.5 flex-1">
            <label class="text-sm font-bold text-gray-700">後五碼 (選填)</label>
            <el-input v-model="editForm.account_last_5" size="large" />
          </div>
          <div class="flex flex-col gap-1.5 flex-1">
            <label class="text-sm font-bold text-gray-700">匯款方式</label>
            <el-input v-model="editForm.payment_method" size="large" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-bold text-gray-700">繳費項目 (用逗號分隔)</label>
          <el-input v-model="editForm.payment_items_raw" placeholder="例如: 月費, 加購練習衣" size="large" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3 mt-4">
          <el-button @click="editDialogVisible = false" class="!rounded-xl font-bold px-6" size="large">取消</el-button>
          <el-button type="primary" :loading="isEditingRemittance" @click="saveRemittanceEdit" class="!rounded-xl font-bold px-6" size="large">儲存變更</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- Data Table -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" v-loading="isLoading">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[800px]">
          <thead>
            <tr class="bg-gray-50/80 border-b border-gray-100">
              <th class="py-3 px-4 text-left font-bold text-gray-500 text-sm whitespace-nowrap">球員姓名</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">本月練球紀錄 (總計 / 請假)</th>
              <!-- <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">單次費率</th> -->
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">應收 (扣除請假)</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">手動應扣/減免</th>
              <th class="py-3 px-4 text-center font-bold text-gray-800 text-sm whitespace-nowrap">總結應繳</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">繳費狀態</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="feesList.length === 0" class="hover:bg-gray-50/50">
              <td colspan="7" class="py-8 text-center text-gray-400 font-bold">
                請點擊右上角「試算本月」載入校隊名單
              </td>
            </tr>
            <tr v-for="fee in feesList" :key="fee.member_id" class="hover:bg-gray-50/50 transition-colors">
              <td class="py-3 px-4">
                <div class="flex items-center gap-2">
                  <div class="font-black text-gray-800 shrink-0">{{ fee.member_name }}</div>
                  <el-tooltip v-if="fee.has_leave_overlap" content="此月有請假紀錄" placement="top">
                    <span class="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded leading-none shrink-0 border border-blue-100">有假單</span>
                  </el-tooltip>
                  <el-tooltip v-if="fee.is_discounted" content="符合手足同行半價優惠" placement="top">
                    <span class="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded leading-none shrink-0 border border-primary/20">半價優惠</span>
                  </el-tooltip>
                </div>
              </td>
              <td class="py-3 px-4">
                <div class="text-center font-bold text-gray-600 flex items-center justify-center">
                  <el-input-number 
                    v-model="fee.total_sessions" 
                    :min="0" :step="1" 
                    size="small" 
                    class="!w-24 font-mono font-bold mr-2"
                    @change="markChanged(fee)"
                  />
                  /
                  <span class="text-blue-500 ml-2" title="請假次數">{{ fee.leave_sessions }}</span>
                </div>
              </td>
              <!-- <td class="py-3 px-4 text-center font-mono text-gray-500 text-sm">${{ fee.per_session_fee }}</td> -->
              <td class="py-3 px-4 text-center font-mono text-gray-800 font-bold tracking-wider">
                ${{ (fee.total_sessions - fee.leave_sessions) * fee.per_session_fee }}
              </td>
              <td class="py-3 px-4">
                <div class="flex justify-center flex-col items-center">
                  <el-input-number 
                    v-model="fee.deduction_amount" 
                    :min="-10000" :max="10000" :step="50" 
                    size="small" 
                    class="!w-24 font-mono font-bold"
                    @change="markChanged(fee)"
                  />
                  <div class="text-[10px] text-gray-400 mt-0.5 leading-none">負數為加收,正數減免</div>
                </div>
              </td>
              <td class="py-3 px-4 text-center font-mono font-black text-lg tracking-wider" :class="getPayableClass(fee)">
                ${{ ((fee.total_sessions - fee.leave_sessions) * fee.per_session_fee) - fee.deduction_amount }}
              </td>
              <td class="py-3 px-4">
                <div class="flex justify-center">
                  <el-switch
                    v-model="fee.is_paid"
                    inline-prompt
                    active-text="已繳"
                    inactive-text="未繳"
                    class="ml-2 font-bold"
                    style="--el-switch-on-color: #10b981; --el-switch-off-color: #ef4444;"
                    @change="markChanged(fee)"
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/services/supabase'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, BellFilled, Calendar, Edit, Delete } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const selectedMonth = ref(dayjs().subtract(1, 'month').format('YYYY-MM'))
const isLoading = ref(false)
const isCalculating = ref(false)
const feesList = ref<any[]>([])
const schoolTeamRemittances = ref<any[]>([])
const currentSchoolTeamMembers = ref<any[]>([])
const classDates = ref<string[]>([])

const drawerVisible = ref(false)
const drawerSize = computed(() => {
  return window.innerWidth < 640 ? '100%' : '450px'
})

const editDialogVisible = ref(false)
const isEditingRemittance = ref(false)
const editForm = ref({
  id: '',
  amount: 0,
  remittance_date: '',
  account_last_5: '',
  payment_method: '',
  payment_items_raw: ''
})

const pendingChanges = ref<string[]>([])
const hasChanges = computed(() => pendingChanges.value.length > 0)

const disabledDate = (time: Date) => {
  if (!selectedMonth.value) return false
  const monthString = dayjs(selectedMonth.value).format('YYYY-MM')
  return dayjs(time).format('YYYY-MM') !== monthString
}

const setDefaultClassDates = () => {
  if (!selectedMonth.value) return
  const month = dayjs(selectedMonth.value)
  const daysInMonth = month.daysInMonth()
  const stSats = []
  for (let i = 1; i <= daysInMonth; i++) {
    const curDay = month.date(i)
    if (curDay.day() === 6) { // 6 means Saturday in dayjs by default
      stSats.push(curDay.format('YYYY-MM-DD'))
    }
  }
  classDates.value = stSats
}

const onMonthChange = () => {
  setDefaultClassDates()
  fetchData()
}

const markChanged = (fee: any) => {
  if (!pendingChanges.value.includes(fee.member_id)) {
    pendingChanges.value.push(fee.member_id)
  }
}

const getPayableClass = (fee: any) => {
  const amount = ((fee.total_sessions - fee.leave_sessions) * fee.per_session_fee) - fee.deduction_amount
  if (amount < 0) return 'text-red-500' // 負數代表系統欠球員(預付額度)或應退
  if (amount === 0) return 'text-gray-400'
  return 'text-primary'
}

const fetchData = async () => {
  calculateFees()
}

// 核心試算邏輯
const calculateFees = async () => {
  if (!selectedMonth.value) return
  isLoading.value = true
  isCalculating.value = true
  pendingChanges.value = []
  
  try {
    const startOfMonth = dayjs(selectedMonth.value).startOf('month').format('YYYY-MM-DD')
    const endOfMonth = dayjs(selectedMonth.value).endOf('month').format('YYYY-MM-DD')

    // 1. 撈取校隊名單
    const { data: membersData, error: membersErr } = await supabase
      .from('team_members')
      .select('id, name, status, sibling_ids')
      .eq('role', '校隊')
    if (membersErr) throw membersErr

    const members = membersData?.filter(m => m.status !== '退隊') || []
    
    // 預處理：確保手足連結是對稱的（防呆：萬一只單向填寫，另一方忘記填寫）
    members.forEach(m => {
      if (m.sibling_ids && m.sibling_ids.length > 0) {
        m.sibling_ids.forEach((sId: string) => {
          const sibling = members.find(x => x.id === sId)
          if (sibling) {
            if (!sibling.sibling_ids) sibling.sibling_ids = []
            if (!sibling.sibling_ids.includes(m.id)) {
              sibling.sibling_ids.push(m.id)
            }
          }
        })
      }
    })

    const memberIds = members.map(m => m.id)
    currentSchoolTeamMembers.value = members
    
    // 平行取得最新的校隊匯款回報
    fetchRemittances(members)

    // 2. 撈取本月所有人費率設定 (如果沒有則預設 500)
    const { data: feeSettings, error: fsErr } = await supabase
      .from('fee_settings')
      .select('member_id, per_session_fee')
      .in('member_id', memberIds)
    if (fsErr) throw fsErr

    const feeSettingMap = new Map(feeSettings?.map(f => [f.member_id, f.per_session_fee]))

    // 舊版點名事件邏輯已移除，改由 classDates 長度控制 baseTotalSessions

    // 撈取該月請假紀錄 (關聯假單系統)
    const { data: leaves, error: leavesErr } = await supabase
      .from('leave_requests')
      .select('user_id, start_date, end_date')
      .lte('start_date', endOfMonth)
      .gte('end_date', startOfMonth)
    if (leavesErr) throw leavesErr

    // 依照該月份「指定日期」來算請假次數
    const leaveMap = new Map()
    const preciseLeaveMap = new Map<string, Record<string, boolean>>()
    
    // 確保用來當作母數的次數與實際選取日期相符
    let computedBaseSessions = classDates.value ? classDates.value.length : 0

    members.forEach(member => {
      const p_leaves = leaves?.filter(l => l.user_id === member.id) || []
      
      let leaveCount = 0
      const dateLeaveRecord: Record<string, boolean> = {}

      if (classDates.value) {
        classDates.value.forEach(d => {
          const isLeave = p_leaves.some(l => {
            return d >= l.start_date && d <= l.end_date
          })
          dateLeaveRecord[d] = isLeave
          if (isLeave) leaveCount++
        })
      }

      leaveMap.set(member.id, leaveCount)
      preciseLeaveMap.set(member.id, dateLeaveRecord)
    })


    // 撈取資料庫中已寫入的 monthly_fees 紀錄
    const { data: existingFees, error: existingErr } = await supabase
      .from('monthly_fees')
      .select('*')
      .eq('year_month', selectedMonth.value)
    if (existingErr) throw existingErr

    const existingFeeMap = new Map(existingFees?.map(f => [f.member_id, f]))

    // 組裝
    feesList.value = members.map(m => {
      let per_session_fee = feeSettingMap.get(m.id) || 500
      
      // 手足半價優惠處理 (直接折半單次費率)
      // 若兩者互設為手足，避免兩人同時半價，我們規定 UUID 較小的一方付全額，較大的一方享半價
      let isDiscounted = false
      if (m.sibling_ids && m.sibling_ids.length > 0) {
        for (const sId of m.sibling_ids) {
          // 確保該手足同樣位於這次的結算名單中
          if (members.find(x => x.id === sId)) {
            // 如果存在任何一個同名單手足的 ID 比自己的 ID 小，就由對方付全額，自己拿半價優惠
            if (m.id > sId) {
              isDiscounted = true
              break
            }
          }
        }
        
        if (isDiscounted) {
          per_session_fee = Math.round(per_session_fee / 2)
        }
      }
      
      const leave_sessions = leaveMap.get(m.id) || 0
      const has_leave_overlap = leave_sessions > 0
      
      const existing = existingFeeMap.get(m.id)

      return {
        member_id: m.id,
        member_name: m.name,
        month: selectedMonth.value,
        total_sessions: computedBaseSessions, // 改為根據日期的數量作為總次數
        leave_sessions: leave_sessions,
        per_session_fee: per_session_fee,
        deduction_amount: existing ? existing.deduction_amount : 0,
        is_paid: existing ? existing.status === 'paid' : false,
        has_leave_overlap,
        is_discounted: isDiscounted,
        sibling_ids: m.sibling_ids,
        detailed_leaves: preciseLeaveMap.get(m.id)
      }
    })

  } catch (e: any) {
    ElMessage.error('試算失敗: ' + e.message)
    console.error(e)
  } finally {
    isLoading.value = false
    isCalculating.value = false
  }
}

const saveAll = async () => {
  if (pendingChanges.value.length === 0) return
  isLoading.value = true
  
  try {
    const payloads = feesList.value
      .filter(f => pendingChanges.value.includes(f.member_id))
      .map(f => ({
        member_id: f.member_id,
        year_month: f.month,
        total_sessions: f.total_sessions,
        leave_sessions: f.leave_sessions,
        per_session_fee: f.per_session_fee,
        payable_amount: ((f.total_sessions - f.leave_sessions) * f.per_session_fee) - f.deduction_amount,
        deduction_amount: f.deduction_amount,
        status: f.is_paid ? 'paid' : 'unpaid',
        updated_at: new Date().toISOString()
      }))

    const { error } = await supabase
      .from('monthly_fees')
      .upsert(payloads, { onConflict: 'member_id, year_month' })

    if (error) throw error
    ElMessage.success('存檔成功')
    pendingChanges.value = []
    
  } catch(e: any) {
    ElMessage.error('存檔失敗: ' + e.message)
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

// 匯出 CSV 方法
const exportCSV = () => {
  if (feesList.value.length === 0) {
    ElMessage.warning('目前沒有結算資料可匯出');
    return;
  }

  const sortedDates = [...(classDates.value || [])].sort((a,b) => dayjs(a).valueOf() - dayjs(b).valueOf());
  const dateHeaders = sortedDates.map(d => dayjs(d).format('M/D'));

  // CSV 表頭
  const headers = ['姓名', ...dateHeaders, '應扣', '應收', '應繳'];
  const rows = [headers];

  // 資料列
  feesList.value.forEach(fee => {
    const row = [];
    row.push(fee.member_name);

    const preciseLeaves = fee.detailed_leaves || {};

    sortedDates.forEach((date: string) => {
      // 判斷該日是否請假
      let isLeave = false;
      if (preciseLeaves[date]) {
        isLeave = true;
      }

      if (isLeave) {
        row.push('/'); // 呈現請假斜線
      } else {
        row.push(fee.per_session_fee); // 出席則顯示單次費率
      }
    });

    row.push(fee.deduction_amount.toString());

    // 應收 (不含應扣)
    const attendedSessions = fee.total_sessions - fee.leave_sessions;
    const amountToReceive = attendedSessions * fee.per_session_fee;
    row.push(amountToReceive.toString());

    // 應繳 (應收 - 應扣)
    const payable = amountToReceive - fee.deduction_amount;
    row.push(payable.toString());

    rows.push(row);
  });

  // 加入 BOM (\uFEFF) 讓 Excel 支援預設 UTF-8 打開不亂碼
  const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `校隊月費結算表_${selectedMonth.value}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  ElMessage.success('報表已匯出');
}

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '-'
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm')
}

// 撈取近期寫入的季費總表，過濾出有包含「本校隊清單中任何一員」的新回報
const fetchRemittances = async (schoolTeamMembers: any[]) => {
  try {
    const stIds = schoolTeamMembers.map(m => m.id)
    if (stIds.length === 0) return

    // 撈取近期 30 筆最新表單資料就好，這區塊只作為提示使用
    const { data, error } = await supabase
      .from('quarterly_fees')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
      
    if (error) throw error
    
    if (data) {
      // 根據使用者要求：「結算月份三月，匯款是四月份才顯示」 (後收制)
      // 算出目前選擇的結算月份的「下一個月」
      const nextMonthPrefix = dayjs(selectedMonth.value).add(1, 'month').format('YYYY-MM')

      schoolTeamRemittances.value = data.filter(fee => {
        let extractedIds: string[] = []
        if (Array.isArray(fee.member_ids) && fee.member_ids.length > 0) {
          extractedIds = fee.member_ids
        } else if (fee.member_id) {
          extractedIds = [fee.member_id]
        }
        
        const isTeamMember = extractedIds.some(id => stIds.includes(id))
        const dateToCheck = fee.remittance_date || fee.created_at || ''
        const isNextMonth = dateToCheck.startsWith(nextMonthPrefix)

        return isTeamMember && fee.status !== 'paid' && isNextMonth
      }).map(fee => {
        // 將 ID 解析為實際的球員名稱
        let extractedIds: string[] = []
        if (Array.isArray(fee.member_ids) && fee.member_ids.length > 0) {
          extractedIds = fee.member_ids
        } else if (fee.member_id) {
          extractedIds = [fee.member_id]
        }
        
        const names = extractedIds.map(id => schoolTeamMembers.find(m => m.id === id)?.name).filter(Boolean).join(', ')
        return {
          ...fee,
          member_names: names || '未知球員'
        }
      })
    }
  } catch (err) {
    console.error('未能取得近期匯款回報', err)
  }
}

const openEditDialog = (r: any) => {
  editForm.value = {
    id: r.id,
    amount: r.amount || 0,
    remittance_date: r.remittance_date || '',
    account_last_5: r.account_last_5 || '',
    payment_method: r.payment_method || '',
    payment_items_raw: Array.isArray(r.payment_items) ? r.payment_items.join(', ') : ''
  }
  editDialogVisible.value = true
}

const saveRemittanceEdit = async () => {
  if (!editForm.value.id) return
  isEditingRemittance.value = true
  try {
    const items = editForm.value.payment_items_raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const { error } = await supabase
      .from('quarterly_fees')
      .update({
        amount: editForm.value.amount,
        remittance_date: editForm.value.remittance_date,
        account_last_5: editForm.value.account_last_5,
        payment_method: editForm.value.payment_method,
        payment_items: items
      })
      .eq('id', editForm.value.id)

    if (error) throw error
    ElMessage.success('儲存成功')
    editDialogVisible.value = false
    fetchRemittances(currentSchoolTeamMembers.value)
  } catch (err: any) {
    ElMessage.error('儲存失敗: ' + err.message)
  } finally {
    isEditingRemittance.value = false
  }
}

const markAsPaid = async (remittance: any) => {
  try {
    // 1. 將回報紀錄標記為已繳費 (隱藏)
    const { error } = await supabase
      .from('quarterly_fees')
      .update({ status: 'paid' })
      .eq('id', remittance.id)
      
    if (error) throw error
    
    // 2. 自動嘗試將目前的月費試算表中該名成員標記為已繳費並存檔
    let syncedMonthly = false
    let extractedIds: string[] = []
    if (Array.isArray(remittance.member_ids) && remittance.member_ids.length > 0) {
      extractedIds = remittance.member_ids
    } else if (remittance.member_id) {
      extractedIds = [remittance.member_id]
    }

    if (extractedIds.length > 0 && feesList.value.length > 0) {
      extractedIds.forEach(id => {
        const feeItem = feesList.value.find(f => f.member_id === id)
        if (feeItem && !feeItem.is_paid) {
          feeItem.is_paid = true
          markChanged(feeItem)
          syncedMonthly = true
        }
      })
    }

    if (syncedMonthly) {
      await saveAll() // 自動存檔目前月份的狀態
    }

    ElMessage.success(syncedMonthly ? '已標記為已繳費，並同步更新此月對帳單！' : '已確認款項！(當前月份無需對帳)')
    
    // 3. 更新本地狀態移除抽屜
    const idx = schoolTeamRemittances.value.findIndex(r => r.id === remittance.id)
    if (idx !== -1) {
      schoolTeamRemittances.value.splice(idx, 1) // 從抽屜中移除
    }
  } catch (err) {
    console.error('更新狀態失敗', err)
    ElMessage.error('更新狀態失敗')
  }
}

const handleDeleteRemittance = async (id: string) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆匯款回報嗎？這不會刪除任何成員的繳費狀態，只會刪除表單紀錄。', '刪除確認', {
      confirmButtonText: '確定刪除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    const { error } = await supabase.from('quarterly_fees').delete().eq('id', id)
    if (error) throw error
    ElMessage.success('已刪除')
    fetchRemittances(currentSchoolTeamMembers.value)
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('刪除失敗: ' + err.message)
    }
  }
}

onMounted(() => {
  setDefaultClassDates()
  fetchData()
})
</script>
