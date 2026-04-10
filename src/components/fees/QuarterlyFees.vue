<template>
  <div class="flex flex-col gap-6 animate-fade-in pt-2">
    <!-- Filters and Actions -->
    <div class="bg-white p-5 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-4 lg:gap-8 items-start lg:items-end justify-between">
      
      <!-- 左側：篩選與設定工具區 -->
      <div class="w-full lg:w-auto flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-end">
        <div class="w-full sm:w-auto flex flex-col gap-1.5">
          <label class="text-xs font-bold text-gray-500">結算季度</label>
          <el-select 
            v-model="selectedQuarter" 
            placeholder="選擇季度" 
            class="!w-full sm:!w-48" 
            size="large" 
            @change="fetchData"
          >
            <el-option v-for="q in generatedQuarters" :key="q" :label="q" :value="q" />
          </el-select>
        </div>
        
        <div class="w-full sm:w-auto flex flex-col gap-1.5">
          <label class="text-xs font-bold text-gray-500">繳費狀態篩選</label>
          <el-radio-group v-model="filterStatus" size="large" class="!w-full sm:!w-auto flex flex-nowrap shrink-0">
            <el-radio-button value="all" class="!flex-1 sm:!flex-none text-center">全部 ({{ feesList.length }})</el-radio-button>
            <el-radio-button value="unpaid" class="!flex-1 sm:!flex-none text-center">未繳費 ({{ feesList.filter(f => !f.is_paid).length }})</el-radio-button>
            <el-radio-button value="paid" class="!flex-1 sm:!flex-none text-center">已繳費 ({{ feesList.filter(f => f.is_paid).length }})</el-radio-button>
          </el-radio-group>
        </div>
      </div>

      <!-- 右側：動作按鈕區 -->
      <div class="w-full lg:w-auto flex flex-col sm:flex-row gap-2 mt-2 lg:mt-0 justify-end flex-shrink-0">
        <button 
          @click="exportCSV" 
          :disabled="isLoading || filteredFeesList.length === 0"
          class="w-full sm:w-auto bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          匯出 CSV 報表
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
          <h3 class="text-blue-800 font-bold text-base">近期收到 {{ playerRemittances.length }} 筆球員匯款回報</h3>
          <p class="text-blue-600/80 text-[10px] sm:text-xs mt-0.5">點擊查看詳情，並在下方列表將其切換為「已繳」</p>
        </div>
      </div>
      <button 
        @click="drawerVisible = true" 
        :disabled="playerRemittances.length === 0"
        :class="[
          'w-full sm:w-auto font-bold py-2.5 px-6 rounded-xl text-sm transition-all shadow-sm flex items-center justify-center gap-2 shrink-0',
          playerRemittances.length === 0 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 active:scale-95 text-white'
        ]"
      >
        查看並處理回報 <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
      </button>
    </div>

    <!-- 匯款回報處理抽屜 -->
    <el-drawer v-model="drawerVisible" title="球員最新匯款回報" :size="drawerSize" class="!rounded-l-2xl">
      <div class="flex flex-col gap-4">
        <div :id="`fee-card-${r.id}`" v-for="r in playerRemittances" :key="r.id" class="bg-gray-50 border border-gray-100 rounded-xl p-4 relative group overflow-hidden shadow-sm transition-colors duration-1000">
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
              {{ item === '加購其他項目:' && r.other_item_note ? `${item} ${r.other_item_note}` : item }}
            </span>
          </div>

          <div class="flex items-center justify-between mt-auto pt-3 border-t border-gray-200/60">
             <div class="text-[10px] text-gray-400">填寫於 {{ formatTimestamp(r.created_at) }}</div>
             <div class="flex gap-2">
               <button @click="markAsPaid(r)" class="flex items-center gap-1 text-xs text-green-600 font-bold hover:bg-green-100 hover:text-green-700 px-2.5 py-1.5 rounded transition-colors bg-green-50 shadow-sm border border-green-200/50">
                 <el-icon><Check /></el-icon> 確認款項
               </button>
               <button @click="handleDeleteRemittance(r.id)" class="flex items-center justify-center text-red-500 font-bold hover:bg-red-100 w-7 h-7 rounded transition-colors bg-red-50">
                 <el-icon><Delete /></el-icon>
               </button>
             </div>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- 編輯特定人員匯款單明細的彈窗 -->
    <el-dialog v-model="editDialogVisible" title="編輯匯款單明細" width="90%" class="max-w-md !rounded-2xl" append-to-body>
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
            <label class="text-sm font-bold text-gray-700">匯款方式</label>
            <el-input v-model="editForm.payment_method" size="large" />
          </div>
          <div class="flex flex-col gap-1.5 flex-1">
            <label class="text-sm font-bold text-gray-700">後五碼 (無摺存款填12345)</label>
            <el-input v-model="editForm.account_last_5" size="large" />
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-bold text-gray-700">繳費項目</label>
          <el-checkbox-group v-model="editForm.payment_items" class="flex flex-wrap gap-2">
            <el-checkbox value="入隊費($700)">入隊費($700)</el-checkbox>
            <el-checkbox value="學費(計次)">學費(計次)</el-checkbox>
            <el-checkbox value="學費(季繳$6000/3000)">學費(季繳)</el-checkbox>
            <el-checkbox value="加購帽子($400)">加購帽子($400)</el-checkbox>
            <el-checkbox value="加購球衣($1000)">加購球衣($1000)</el-checkbox>
            <el-checkbox value="加購風衣($900)">加購風衣($900)</el-checkbox>
            <el-checkbox value="加購球褲($600)">加購球褲($600)</el-checkbox>
            <el-checkbox value="加購黑色長襪($150)">長襪($150)</el-checkbox>
            <el-checkbox value="加購裝備包($1900)">裝備包($1900)</el-checkbox>
            <el-checkbox value="加購其他項目:">加購其他項目:</el-checkbox>
          </el-checkbox-group>
        </div>
        <div class="flex flex-col gap-1.5" v-if="editForm.payment_items.includes('加購其他項目:')">
           <el-input v-model="editForm.other_item_note" placeholder="請填入其他購買項目描述" size="large" />
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end gap-3 mt-4">
          <el-button @click="editDialogVisible = false" class="!rounded-xl font-bold px-6" size="large">取消</el-button>
          <el-button type="primary" @click="saveRemittanceEdit" class="!rounded-xl font-bold px-6" size="large">確定變更</el-button>
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
              <th class="py-3 px-4 text-left font-bold text-gray-500 text-sm whitespace-nowrap">匯款明細 / 項目</th>
              <th class="py-3 px-4 text-center font-bold text-gray-800 text-sm whitespace-nowrap">應繳金額</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">操作紀錄</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">繳費狀態</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="filteredFeesList.length === 0" class="hover:bg-gray-50/50">
              <td colspan="5" class="py-8 text-center text-gray-400 font-bold">
                沒有符合條件的球員紀錄
              </td>
            </tr>
            <tr :id="`fee-row-${fee.member_id}`" v-for="fee in filteredFeesList" :key="fee.member_id" class="hover:bg-gray-50/50 transition-colors duration-1000">
              <td class="py-3 px-4">
                <div class="flex items-center gap-2">
                  <div class="font-black text-gray-800 shrink-0">{{ fee.member_name }}</div>
                  <el-tooltip v-if="fee.is_discounted" content="符合手足同行半價優惠" placement="top">
                    <span class="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded leading-none shrink-0 border border-primary/20">半價優惠</span>
                  </el-tooltip>
                </div>
              </td>
              <td class="py-3 px-4">
                <div class="flex flex-wrap gap-1 max-w-[280px]">
                  <template v-if="fee.payment_items && fee.payment_items.length > 0">
                    <span v-for="item in fee.payment_items" :key="item" class="text-[10px] bg-indigo-50 text-indigo-500 border border-indigo-100 px-1.5 py-0.5 rounded truncate max-w-full font-bold">
                      {{ item === '加購其他項目:' && fee.other_item_note ? `${item} ${fee.other_item_note}` : item }}
                    </span>
                  </template>
                  <span v-else class="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded font-bold">未設定明細</span>
                </div>
              </td>
              <td class="py-3 px-4 text-center">
                <el-input-number 
                  v-model="fee.amount" 
                  :min="0" :step="50" 
                  size="small" 
                  class="!w-28 font-mono font-bold"
                  @change="markChanged(fee)"
                />
              </td>
              <td class="py-3 px-4 text-center">
                 <button @click="openEditDialog(fee)" class="text-blue-500 font-bold text-sm px-3 py-1.5 rounded hover:bg-blue-50 transition-colors">
                  編輯明細
                 </button>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { BellFilled, Calendar, Check, Delete } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { useRoute } from 'vue-router'
import { useWindowSize } from '@vueuse/core'

const route = useRoute()
const highlightFeeId = computed(() => route.query.highlight_fee_id as string | undefined)
const highlightMemberId = computed(() => route.query.highlight_member_id as string | undefined)

const isLoading = ref(false)
const { width } = useWindowSize()

const generatedQuarters = computed(() => {
  const currentYear = dayjs().year()
  const quarters: string[] = []
  const startYear = Math.max(2026, currentYear - 1)
  for (let y = startYear; y <= currentYear + 1; y++) {
    for (let q = 1; q <= 4; q++) { quarters.push(`${y}-Q${q}`) }
  }
  return quarters
})

const selectedQuarter = ref(`${dayjs().year()}-Q${Math.floor(dayjs().month() / 3) + 1}`)

const feesList = ref<any[]>([])
const currentPlayers = ref<any[]>([])
const playerRemittances = ref<any[]>([])

const filterStatus = ref<'all' | 'unpaid' | 'paid'>('all')

const filteredFeesList = computed(() => {
  if (filterStatus.value === 'paid') {
    return feesList.value.filter(f => f.is_paid)
  }
  if (filterStatus.value === 'unpaid') {
    return feesList.value.filter(f => !f.is_paid)
  }
  return feesList.value
})

const pendingChanges = ref<string[]>([])
const hasChanges = computed(() => pendingChanges.value.length > 0)

const drawerVisible = ref(false)
const drawerSize = computed(() => width.value < 640 ? '100%' : '450px')

const editDialogVisible = ref(false)
const editForm = ref({
  member_id: '',
  amount: 0,
  remittance_date: '',
  account_last_5: '',
  payment_method: '',
  payment_items: [] as string[],
  other_item_note: ''
})

const markChanged = (fee: any) => {
  if (!pendingChanges.value.includes(fee.member_id)) {
    pendingChanges.value.push(fee.member_id)
  }
}

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '-'
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm')
}

watch([isLoading, playerRemittances], ([newLoading, newRemittances]) => {
  if (!newLoading) {
    if (highlightFeeId.value) {
      const rMatch = newRemittances.some((r: any) => r.id === highlightFeeId.value)
      if (rMatch) {
         drawerVisible.value = true
         setTimeout(() => {
            const el = document.getElementById(`fee-card-${highlightFeeId.value}`)
            if (el) {
               el.scrollIntoView({ behavior: 'smooth', block: 'center' })
               el.classList.add('bg-yellow-100', 'animate-pulse')
               setTimeout(() => el.classList.remove('bg-yellow-100', 'animate-pulse'), 3000)
            }
         }, 500)
      } else if (highlightMemberId.value) {
         const rowInCurrentFilter = filteredFeesList.value.some((f: any) => f.member_id === highlightMemberId.value)
         if (!rowInCurrentFilter) filterStatus.value = 'all'
         setTimeout(() => {
            const el = document.getElementById(`fee-row-${highlightMemberId.value}`)
            if (el) {
               el.scrollIntoView({ behavior: 'smooth', block: 'center' })
               el.classList.add('bg-yellow-100', 'animate-pulse')
               setTimeout(() => el.classList.remove('bg-yellow-100', 'animate-pulse'), 3000)
            }
         }, 500)
      }
    }
  }
})

const fetchData = async () => {
  isLoading.value = true
  pendingChanges.value = []
  feesList.value = []
  
  try {
    const { data: membersData, error: mErr } = await supabase
      .from('team_members')
      .select('id, name, status, sibling_ids, is_primary_payer, role')
      .in('role', ['球員'])
      
    if (mErr) throw mErr
    
    const members = membersData?.filter(m => m.status !== '退隊') || []

    members.forEach(m => {
      if (m.sibling_ids && m.sibling_ids.length > 0) {
        m.sibling_ids.forEach((sId: string) => {
          const sibling = members.find(x => x.id === sId)
          if (sibling) {
            if (!sibling.sibling_ids) sibling.sibling_ids = []
            if (!sibling.sibling_ids.includes(m.id)) sibling.sibling_ids.push(m.id)
          }
        })
      }
    })

    currentPlayers.value = members
    fetchRemittances(members)

    const { data: existingFees, error: fErr } = await supabase
      .from('quarterly_fees')
      .select('*')
      .eq('year_quarter', selectedQuarter.value)
      
    if (fErr) throw fErr
    
    const recordsMap = new Map()
    existingFees?.forEach(f => {
      let ids: string[] = []
      if (Array.isArray(f.member_ids) && f.member_ids.length > 0) ids = f.member_ids
      else if (f.member_id) ids = [f.member_id]
      
      ids.forEach(id => {
        recordsMap.set(id, f)
      })
    })

    feesList.value = members.map(m => {
      const record = recordsMap.get(m.id)
      let baseAmount = 6000
      let isDiscounted = false
      if (m.sibling_ids && m.sibling_ids.length > 0) {
        if (!m.is_primary_payer) {
          const siblings = m.sibling_ids.map((sId: string) => members.find(x => x.id === sId)).filter(Boolean)
          const hasPrimarySibling = siblings.some((s: any) => s.is_primary_payer)
          if (hasPrimarySibling) isDiscounted = true
          else {
            for (const s of siblings) {
              if (m.id > s.id) { isDiscounted = true; break; }
            }
          }
        }
        if (isDiscounted) baseAmount = 3000
      }

      return {
        member_id: m.id,
        member_name: m.name,
        record_id: record ? record.id : null,
        amount: record ? record.amount : baseAmount,
        payment_items: record && Array.isArray(record.payment_items) ? [...record.payment_items] : (isDiscounted ? ['學費(季繳$6000/3000)'] : ['學費(季繳$6000/3000)']),
        other_item_note: record ? record.other_item_note : '',
        payment_method: record ? record.payment_method : '銀行轉帳',
        account_last_5: record ? record.account_last_5 : '',
        remittance_date: record ? record.remittance_date : dayjs().format('YYYY-MM-DD'),
        is_paid: record ? record.status === 'paid' : false,
        is_discounted: isDiscounted
      }
    })

  } catch (err: any) {
    ElMessage.error('資料載入失敗: ' + err.message)
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const fetchRemittances = async (players: any[]) => {
  try {
    const pIds = players.map(m => m.id)
    if (pIds.length === 0) return

    const { data, error } = await supabase
      .from('quarterly_fees')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
      
    if (error) throw error
    
    if (data) {
      playerRemittances.value = data.filter(fee => {
        let extractedIds: string[] = []
        if (Array.isArray(fee.member_ids) && fee.member_ids.length > 0) extractedIds = fee.member_ids
        else if (fee.member_id) extractedIds = [fee.member_id]
        
        // 分類：確保是目前的球員 (role==='球員')
        const isPlayer = extractedIds.some(id => pIds.includes(id))
        
        // 只看尚未付款，且必須要是該季度的回報
        return isPlayer && fee.status !== 'paid' && fee.year_quarter === selectedQuarter.value
      }).map(fee => {
        let extractedIds: string[] = []
        if (Array.isArray(fee.member_ids) && fee.member_ids.length > 0) extractedIds = fee.member_ids
        else if (fee.member_id) extractedIds = [fee.member_id]
        
        const names = extractedIds.map(id => players.find(m => m.id === id)?.name).filter(Boolean).join(', ')
        return {
          ...fee,
          member_names: names || '未知球員',
          extracted_member_ids: extractedIds
        }
      })
    }
  } catch (err) {
    console.error('未能取得匯款紀錄', err)
  }
}

const saveAll = async () => {
  if (pendingChanges.value.length === 0) return
  isLoading.value = true
  
  try {
    const changedFees = feesList.value.filter(f => pendingChanges.value.includes(f.member_id))
    
    for (const f of changedFees) {
      const payload: any = {
        member_id: f.member_id,
        member_ids: [f.member_id], // 為了向下相容保留舊陣列格式
        year_quarter: selectedQuarter.value,
        amount: f.amount,
        payment_items: f.payment_items,
        other_item_note: f.payment_items.includes('加購其他項目:') ? f.other_item_note : null,
        payment_method: f.payment_method,
        account_last_5: ['銀行轉帳', '郵局無摺', 'ATM存款'].includes(f.payment_method) ? f.account_last_5 : null,
        remittance_date: f.remittance_date,
        updated_at: new Date().toISOString()
      }
      
      payload.status = f.is_paid ? 'paid' : 'unpaid'
      if (f.is_paid) payload.paid_at = new Date().toISOString()
      else payload.paid_at = null

      if (f.record_id) {
        // 更新現有紀錄
        await supabase.from('quarterly_fees').update(payload).eq('id', f.record_id)
      } else {
        // 新增紀錄（第一次觸發該季繳費）
        const { data } = await supabase.from('quarterly_fees').insert([payload]).select('id')
        if (data && data.length > 0) {
          f.record_id = data[0].id
        }
      }
    }

    ElMessage.success('存檔成功')
    pendingChanges.value = []
  } catch (err: any) {
    ElMessage.error('存檔失敗: ' + err.message)
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const markAsPaid = async (remittance: any) => {
  try {
    const { error } = await supabase
      .from('quarterly_fees')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', remittance.id)
      
    if (error) throw error
    
    // 同步更新當前列表狀態
    let synced = false
    if (remittance.extracted_member_ids && remittance.extracted_member_ids.length > 0) {
      remittance.extracted_member_ids.forEach((id: string) => {
        const feeItem = feesList.value.find(f => f.member_id === id)
        if (feeItem && !feeItem.is_paid) {
          feeItem.is_paid = true
          markChanged(feeItem)
          synced = true
        }
      })
    }

    if (synced) {
      await saveAll() // 自動觸發一次儲存
    }
    
    ElMessage.success('款項確認成功，已標記為已繳納')
    
    // 從抽屜清單移除
    playerRemittances.value = playerRemittances.value.filter(r => r.id !== remittance.id)
  } catch (err: any) {
    ElMessage.error('確認失敗: ' + err.message)
  }
}

const handleDeleteRemittance = async (id: string) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆回報表單嗎？', '刪除確認', { type: 'warning' })
    await supabase.from('quarterly_fees').delete().eq('id', id)
    ElMessage.success('已刪除紀錄')
    fetchRemittances(currentPlayers.value)
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err.message)
  }
}

const openEditDialog = (fee: any) => {
  editForm.value = {
    member_id: fee.member_id,
    amount: fee.amount,
    remittance_date: fee.remittance_date || dayjs().format('YYYY-MM-DD'),
    account_last_5: fee.account_last_5 || '',
    payment_method: fee.payment_method || '銀行轉帳',
    payment_items: fee.payment_items ? [...fee.payment_items] : [],
    other_item_note: fee.other_item_note || ''
  }
  editDialogVisible.value = true
}

const saveRemittanceEdit = () => {
  const feeItem = feesList.value.find(f => f.member_id === editForm.value.member_id)
  if (feeItem) {
    feeItem.amount = editForm.value.amount
    feeItem.remittance_date = editForm.value.remittance_date
    feeItem.account_last_5 = editForm.value.account_last_5
    feeItem.payment_method = editForm.value.payment_method
    feeItem.payment_items = [...editForm.value.payment_items]
    feeItem.other_item_note = editForm.value.other_item_note
    markChanged(feeItem)
  }
  editDialogVisible.value = false
}

const exportCSV = () => {
  if (filteredFeesList.value.length === 0) {
    ElMessage.warning('目前沒有結算資料可匯出')
    return
  }

  const headers = ['球員姓名', '項目與明細', '應繳金額', '是否繳交流水']
  const rows = [headers]

  filteredFeesList.value.forEach(fee => {
    let itemsStr = ''
    if (fee.payment_items && fee.payment_items.length > 0) {
      itemsStr = fee.payment_items.join('; ')
      if (fee.other_item_note) itemsStr += ` (${fee.other_item_note})`
    } else {
      itemsStr = '無'
    }
    
    rows.push([
      fee.member_name,
      itemsStr,
      fee.amount.toString(),
      fee.is_paid ? '已繳' : '未繳'
    ])
  })

  // 加入 BOM (\uFEFF) 防止 Excel 亂碼
  const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', `球員季費結算表_${selectedQuarter.value}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  
  ElMessage.success('報表已匯出')
}

onMounted(() => {
  fetchData()
})
</script>
