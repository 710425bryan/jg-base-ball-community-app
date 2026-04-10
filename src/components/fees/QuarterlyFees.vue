<template>
  <div class="flex flex-col gap-4 animate-fade-in">
    <!-- Header Actions & Filters -->
    <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between md:items-center">
      <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <h3 class="font-bold text-gray-800 flex items-center gap-2 shrink-0 m-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-primary" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clip-rule="evenodd" /></svg>
          季費表單清單
        </h3>
        <div class="flex items-center gap-2">
          <el-select v-model="filterQuarter" placeholder="篩選季度" clearable class="w-[120px]">
            <el-option v-for="q in availableQuarters" :key="q" :label="q" :value="q" />
          </el-select>
          <el-input v-model="searchQuery" placeholder="搜尋球員姓名" clearable class="w-[140px]">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </div>
      <button 
        @click="openAddDialog" 
        class="bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-1 shrink-0"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
        <span class="hidden sm:inline">新增季費紀錄</span>
        <span class="sm:hidden">新增</span>
      </button>
    </div>

    <!-- Data Table -->
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" v-loading="isLoading">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[900px]">
          <thead>
            <tr class="bg-gray-50/80 border-b border-gray-100">
              <th class="py-3 px-4 text-left font-bold text-gray-500 text-sm whitespace-nowrap">年度/季度</th>
              <th class="py-3 px-4 text-left font-bold text-gray-500 text-sm whitespace-nowrap">建立時間</th>
              <th class="py-3 px-4 text-left font-bold text-gray-500 text-sm whitespace-nowrap">匯款日期</th>
              <th class="py-3 px-4 text-left font-bold text-gray-500 text-sm whitespace-nowrap">球員姓名</th>
              <th class="py-3 px-4 text-left font-bold text-gray-500 text-sm whitespace-nowrap">匯款項目</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">匯款金額</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">付款方式</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">狀態</th>
              <th class="py-3 px-4 text-right font-bold text-gray-500 text-sm whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="filteredFees.length === 0" class="hover:bg-gray-50/50">
              <td colspan="8" class="py-8 text-center text-gray-400 font-bold">沒有符合條件的紀錄</td>
            </tr>
            <tr v-for="fee in filteredFees" :key="fee.id" class="hover:bg-gray-50/50 transition-colors border-l-4" :class="getQuarterBorderClass(fee.year_quarter)">
              <td class="py-3 px-4 font-mono text-sm font-bold text-gray-600">{{ fee.year_quarter }}</td>
              <td class="py-3 px-4 font-mono text-xs text-gray-400 whitespace-nowrap">{{ formatTimestamp(fee.created_at) }}</td>
              <td class="py-3 px-4 font-mono text-sm">{{ fee.remittance_date || '-' }}</td>
              <td class="py-3 px-4 font-black text-gray-800">{{ getMemberName(fee) }}</td>
              <td class="py-3 px-4">
                <div class="flex flex-wrap gap-1 max-w-[250px]">
                  <template v-if="Array.isArray(fee.payment_items) && fee.payment_items.length > 0">
                    <span v-for="item in fee.payment_items" :key="item" class="text-[10px] bg-gray-100 border text-gray-600 px-1 py-0.5 rounded">{{ item === '加購其他項目:' && fee.other_item_note ? `${item} ${fee.other_item_note}` : item }}</span>
                  </template>
                  <span v-else-if="fee.amount_type" class="text-sm font-bold text-gray-700 max-w-[200px] truncate" :title="fee.amount_type">{{ fee.amount_type }}</span>
                  <span v-else class="text-sm text-gray-400 font-bold">無紀錄</span>
                </div>
              </td>
              <td class="py-3 px-4 text-center font-mono font-bold tracking-wider text-primary">
                ${{ fee.amount }}
              </td>
              <td class="py-3 px-4 text-center">
                <div class="text-sm font-bold text-gray-600 inline-flex flex-col items-center">
                  {{ fee.payment_method }}
                  <span v-if="['銀行轉帳','郵局無摺','ATM存款','匯款'].includes(fee.payment_method) && fee.account_last_5" class="text-[10px] text-gray-400 bg-gray-100 px-1 rounded mt-0.5 font-mono">
                    帳號後5碼: {{ fee.account_last_5 }}
                  </span>
                </div>
              </td>
              <td class="py-3 px-4 text-center">
                <span class="px-2 py-1 rounded text-xs font-bold whitespace-nowrap border" :class="getStatusClass(fee.status)">
                  {{ getStatusText(fee.status) }}
                </span>
              </td>
              <td class="py-3 px-4 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button 
                    v-if="fee.status !== 'paid'"
                    @click="markAsPaid(fee)"
                    class="text-green-600 hover:text-green-700 font-bold text-xs px-2 py-1 rounded border border-green-200 bg-green-50 hover:bg-green-100 transition-colors whitespace-nowrap"
                  >設為已繳</button>
                  <button 
                    @click="editFee(fee)"
                    class="text-primary hover:text-primary/70 font-bold text-sm px-2 py-1 rounded hover:bg-primary/5 transition-colors whitespace-nowrap"
                  >編輯</button>
                  <button 
                    @click="deleteFee(fee)"
                    class="text-red-500 hover:text-red-600 font-bold text-sm px-2 py-1 rounded hover:bg-red-50 transition-colors whitespace-nowrap"
                  >刪除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Form Dialog -->
    <el-dialog 
      v-model="dialogVisible" 
      :title="isEdit ? '編輯季費紀錄' : '新增季費紀錄'" 
      width="90%" 
      max-width="600px"
      class="rounded-2xl overflow-hidden"
    >
      <el-form :model="form" label-position="top" class="mt-2 text-left pb-4 font-bold">
        <!-- 季度預設為當年當季或手動輸入 -->
        <div class="flex gap-4 mb-4">
          <el-form-item label="年度 / 季度" class="flex-1 mb-0" required>
            <el-select v-model="form.year_quarter" placeholder="如：2024-Q1" filterable class="w-full font-mono text-bold">
              <el-option v-for="q in generatedQuarters" :key="q" :label="q" :value="q" />
            </el-select>
          </el-form-item>
          <el-form-item label="狀態" class="flex-1 mb-0" required>
            <el-select v-model="form.status" class="w-full">
              <el-option label="待驗證 (Pending)" value="pending_review" />
              <el-option label="已繳費 (Paid)" value="paid" />
              <el-option label="未繳費 (Unpaid)" value="unpaid" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="球員姓名(可選擇多位) *" required>
          <el-select v-model="form.member_ids" multiple placeholder="選擇球員" filterable class="w-full">
            <el-option v-for="m in players" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="匯款日期 *" required>
          <el-date-picker
            v-model="form.remittance_date"
            type="date"
            placeholder="年 / 月 / 日"
            format="YYYY/MM/DD"
            value-format="YYYY-MM-DD"
            class="!w-full max-w-[250px]"
          />
        </el-form-item>

        <el-form-item label="匯款金額(請填總金額) *" required>
          <el-input-number v-model="form.amount" :min="0" class="w-full !max-w-[250px] font-mono"></el-input-number>
        </el-form-item>

        <el-form-item label="匯款方式 *" required>
          <el-radio-group v-model="form.payment_method" class="flex flex-col gap-2 mt-2 w-full max-w-[300px]" :class="{'!items-stretch': true}">
            <el-radio value="銀行轉帳" class="!mr-0 font-bold border rounded-lg px-3 py-4 hover:bg-gray-50 h-auto" :class="form.payment_method === '銀行轉帳' ? 'border-primary bg-primary/5' : 'border-gray-200'">銀行轉帳</el-radio>
            <el-radio value="郵局無摺" class="!mr-0 font-bold border rounded-lg px-3 py-4 hover:bg-gray-50 h-auto" :class="form.payment_method === '郵局無摺' ? 'border-primary bg-primary/5' : 'border-gray-200'">郵局無摺</el-radio>
            <el-radio value="ATM存款" class="!mr-0 font-bold border rounded-lg px-3 py-4 hover:bg-gray-50 h-auto" :class="form.payment_method === 'ATM存款' ? 'border-primary bg-primary/5' : 'border-gray-200'">ATM存款</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="匯款後5碼 (無摺存款請填12345) *" v-if="['銀行轉帳', '郵局無摺', 'ATM存款'].includes(form.payment_method)">
          <el-input v-model="form.account_last_5" placeholder="請填寫末五碼" class="font-mono text-lg max-w-[250px]"></el-input>
        </el-form-item>

        <el-form-item label="匯款項目 *" required>
          <el-checkbox-group v-model="form.payment_items" class="flex flex-col items-start gap-1">
            <el-checkbox value="入隊費($700)">入隊費($700)</el-checkbox>
            <el-checkbox value="學費(計次)">學費(計次)</el-checkbox>
            <el-checkbox value="學費(季繳$6000/3000)">學費(季繳$6000/3000)</el-checkbox>
            <el-checkbox value="加購練習衣($350)">加購練習衣($350)</el-checkbox>
            <el-checkbox value="加購帽子($400)">加購帽子($400)</el-checkbox>
            <el-checkbox value="加購球衣($1000)">加購球衣($1000)</el-checkbox>
            <el-checkbox value="加購風衣($900)">加購風衣($900)</el-checkbox>
            <el-checkbox value="加購球褲($600)">加購球褲($600)</el-checkbox>
            <el-checkbox value="加購黑色長襪($150)">加購黑色長襪($150)</el-checkbox>
            <el-checkbox value="加購裝備包($1900)">加購裝備包($1900)</el-checkbox>
            <el-checkbox value="加購其他項目:">加購其他項目:</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item v-if="Array.isArray(form.payment_items) && form.payment_items.includes('加購其他項目:')" class="-mt-2">
          <el-input v-model="form.other_item_note" placeholder="請填入其他購買項目描述" class="max-w-[300px]"></el-input>
        </el-form-item>
        
      </el-form>
      <template #footer>
        <div class="flex justify-end gap-3 pb-2 pt-2 border-t border-gray-100 mt-2">
          <el-button @click="dialogVisible = false" size="large" class="!rounded-xl font-bold">取消</el-button>
          <el-button type="primary" @click="submitForm" :loading="isSubmitting" size="large" class="!bg-primary !border-primary !rounded-xl font-bold">儲存紀錄</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const isLoading = ref(true)
const dialogVisible = ref(false)
const isSubmitting = ref(false)
const isEdit = ref(false)

const feesList = ref<any[]>([])
const players = ref<any[]>([])

const filterQuarter = ref('')
const searchQuery = ref('')

const availableQuarters = computed(() => {
  const quarters = new Set(feesList.value.map(f => f.year_quarter))
  return Array.from(quarters).sort().reverse()
})

const generatedQuarters = computed(() => {
  const currentYear = dayjs().year()
  const quarters: string[] = []
  // 為了方便補登記與提前收費，固定產生 前一年、今年、明年 共 12 個季度組合
  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    for (let q = 1; q <= 4; q++) {
      quarters.push(`${y}-Q${q}`)
    }
  }
  return quarters
})

const filteredFees = computed(() => {
  return feesList.value.filter(fee => {
    // 組合新舊欄位的 IDs (為了兼容之前的舊資料)
    let extractedIds: string[] = []
    if (Array.isArray(fee.member_ids) && fee.member_ids.length > 0) {
      extractedIds = fee.member_ids
    } else if (fee.member_id) {
      extractedIds = [fee.member_id]
    }

    // 如果這筆紀錄對應到校隊球員，則在「季費表單清單」中隱藏 (校隊是由月費管理)
    const hasSchoolTeamMember = extractedIds.some((id: string) => {
      const p = players.value.find((p: any) => p.id === id)
      return p && p.role === '校隊'
    })
    if (hasSchoolTeamMember) return false

    const matchQuarter = !filterQuarter.value || fee.year_quarter === filterQuarter.value
    
    // getMemberName 內部一樣最好兼容
    const matchName = !searchQuery.value || getMemberName(fee).includes(searchQuery.value)
    
    return matchQuarter && matchName
  })
})

const initialForm = {
  id: '',
  member_ids: [] as string[],
  year_quarter: `${dayjs().year()}-Q${Math.floor(dayjs().month() / 3) + 1}`,
  remittance_date: dayjs().format('YYYY-MM-DD'),
  payment_items: [] as string[],
  other_item_note: '',
  amount: 0,
  note: '',
  payment_method: '銀行轉帳',
  account_last_5: '',
  status: 'pending_review'
}

const form = ref({...initialForm})

const getMemberName = (feeOrIds: any) => {
  if (!feeOrIds) return '未知球員';
  
  let ids: string[] = []
  if (Array.isArray(feeOrIds)) {
    ids = feeOrIds
  } else if (typeof feeOrIds === 'string') {
    ids = [feeOrIds]
  } else if (typeof feeOrIds === 'object') {
    if (Array.isArray(feeOrIds.member_ids) && feeOrIds.member_ids.length > 0) {
      ids = feeOrIds.member_ids
    } else if (feeOrIds.member_id) {
      ids = [feeOrIds.member_id]
    }
  }

  if (ids.length === 0) return '未知球員'
  const names = ids.map(id => {
    const p = players.value.find(p => p.id === id);
    return p ? p.name : '(已刪除之球員)';
  });
  return names.length > 0 ? names.join(', ') : '未知球員';
}

const getStatusClass = (status: string) => {
  if (status === 'paid') return 'bg-green-50 text-green-600 border-green-200'
  if (status === 'pending_review') return 'bg-yellow-50 text-yellow-600 border-yellow-200'
  return 'bg-red-50 text-red-500 border-red-200'
}

const getStatusText = (status: string) => {
  if (status === 'paid') return '已繳納'
  if (status === 'pending_review') return '審核中'
  return '未繳納'
}

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '-'
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm')
}

const getQuarterBorderClass = (quarter: string) => {
  // 將季度對應到一組指定的左側 border 顏色來協助區分不同季度的資料
  if (!quarter) return 'border-transparent'
  const colors = ['border-blue-400', 'border-indigo-400', 'border-purple-400', 'border-pink-400', 'border-orange-400', 'border-teal-400']
  // 利用字串雜湊取得一致的顏色
  let hash = 0
  for (let i = 0; i < quarter.length; i++) {
    hash = quarter.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

const fetchData = async () => {
  isLoading.value = true
  try {
    // 撈取團隊成員名單 (加入 role 用於過濾校隊)
    const { data: members, error: mErr } = await supabase
      .from('team_members')
      .select('id, name, role, sibling_ids')
    if (mErr) throw mErr
    players.value = members || []

    // 撈季費紀錄
    const { data: fees, error: fErr } = await supabase
      .from('quarterly_fees')
      .select('*')
      .order('created_at', { ascending: false })
    if (fErr) throw fErr

    feesList.value = (fees || []).map(fee => {
      // 從 Google 表單進來的資料可能只有一個人，我們自動展開他的手足
      let ids: string[] = [];
      if (Array.isArray(fee.member_ids) && fee.member_ids.length > 0) {
        ids = [...fee.member_ids];
      } else if (fee.member_id) {
        ids = [fee.member_id];
      }

      let expandedIds = [...ids];
      ids.forEach((id: string) => {
        const p = players.value.find((p: any) => p.id === id);
        if (p && Array.isArray(p.sibling_ids) && p.sibling_ids.length > 0) {
          expandedIds.push(...p.sibling_ids);
        }
      });
      // 確保陣列唯一，賦值回 fee 物件
      fee.member_ids = [...new Set(expandedIds)];
      return fee;
    });

  } catch (e: any) {
    ElMessage.error('資料載入失敗: ' + e.message)
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

const openAddDialog = () => {
  isEdit.value = false
  form.value = { ...initialForm }
  dialogVisible.value = true
}

const editFee = (fee: any) => {
  isEdit.value = true
  form.value = { ...fee }
  if (!form.value.member_ids) form.value.member_ids = []
  dialogVisible.value = true
}

const markAsPaid = async (fee: any) => {
  try {
    const { error } = await supabase
      .from('quarterly_fees')
      .update({ 
        status: 'paid', 
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', fee.id)
      
    if (error) throw error
    ElMessage.success('已標記為已繳納')
    
    // 更新本地狀態而不需重撈整張表
    fee.status = 'paid'
  } catch (e: any) {
    ElMessage.error('標記失敗: ' + e.message)
    console.error(e)
  }
}

const deleteFee = async (fee: any) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除 ${getMemberName(fee.member_ids)} 的 ${fee.year_quarter} 季費紀錄嗎？此操作將無法還原！`,
      '刪除紀錄確認',
      {
        confirmButtonText: '確定刪除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    
    const { error } = await supabase
      .from('quarterly_fees')
      .delete()
      .eq('id', fee.id)
      
    if (error) throw error
    
    ElMessage.success('已刪除紀錄')
    feesList.value = feesList.value.filter(f => f.id !== fee.id)
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error('刪除失敗: ' + e.message)
      console.error(e)
    }
  }
}

const submitForm = async () => {
  if (!form.value.member_ids || form.value.member_ids.length === 0 || !form.value.year_quarter || !form.value.remittance_date || !Array.isArray(form.value.payment_items) || form.value.payment_items.length === 0) {
    ElMessage.warning('請填寫完整必填欄位 (包含匯款日期與至少一項匯款項目)')
    return
  }
  
  isSubmitting.value = true
  try {
    const payload = {
      member_ids: form.value.member_ids,
      year_quarter: form.value.year_quarter,
      remittance_date: form.value.remittance_date,
      payment_items: form.value.payment_items,
      other_item_note: form.value.payment_items.includes('加購其他項目:') ? form.value.other_item_note : null,
      amount: form.value.amount,
      note: form.value.note || null,
      payment_method: form.value.payment_method,
      account_last_5: ['銀行轉帳', '郵局無摺', 'ATM存款'].includes(form.value.payment_method) ? form.value.account_last_5 : null,
      status: form.value.status,
      updated_at: new Date().toISOString()
    }
    
    if (form.value.status === 'paid') {
      (payload as any).paid_at = new Date().toISOString()
    }

    if (isEdit.value) {
      const { error } = await supabase.from('quarterly_fees').update(payload).eq('id', form.value.id)
      if (error) throw error
      ElMessage.success('更新成功')
    } else {
      const { error } = await supabase.from('quarterly_fees').insert([payload])
      if (error) throw error
      ElMessage.success('新增成功')
    }
    
    dialogVisible.value = false
    fetchData()
  } catch (e: any) {
    ElMessage.error('儲存失敗: ' + e.message)
    console.error(e)
  } finally {
    isSubmitting.value = false
  }
}

onMounted(() => {
  fetchData()
})
</script>
