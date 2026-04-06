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
                  <el-tooltip v-if="fee.sibling_ids && fee.sibling_ids.length > 0" content="符合手足同行半價優惠" placement="top">
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
import { ref, onMounted, computed, watch } from 'vue'
import { supabase } from '@/services/supabase'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const selectedMonth = ref(dayjs().format('YYYY-MM'))
const isLoading = ref(false)
const isCalculating = ref(false)
const feesList = ref<any[]>([])
const classDates = ref<string[]>([])

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
    const memberIds = members.map(m => m.id)

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
      if (m.sibling_ids && m.sibling_ids.length > 0) {
        per_session_fee = Math.round(per_session_fee / 2)
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

onMounted(() => {
  setDefaultClassDates()
  fetchData()
})
</script>
