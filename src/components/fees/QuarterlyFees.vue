<template>
  <div class="flex flex-col gap-6 animate-fade-in pt-2">
    <!-- Filters and Actions -->
    <div class="bg-white p-5 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-4 lg:gap-8 items-start lg:items-end justify-between">
      
      <!-- 左側：篩選與設定工具區 -->
      <div class="w-full lg:w-auto flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-end">
        <div class="w-full flex flex-col gap-1.5">
          <label class="text-xs font-bold text-gray-500">結算年月區間</label>
          <div class="w-full flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
            <el-date-picker
              v-model="selectedStartMonth"
              type="month"
              value-format="YYYY-MM"
              class="!w-full sm:!w-40"
              size="large"
              @change="handleStartMonthChange"
            />
            <span class="hidden sm:flex items-center text-gray-400 font-bold pb-2">至</span>
            <el-date-picker
              v-model="selectedEndMonth"
              type="month"
              value-format="YYYY-MM"
              class="!w-full sm:!w-40"
              size="large"
              @change="handleEndMonthChange"
            />
            <button
              type="button"
              @click="resetToCurrentQuarter"
              class="w-full sm:w-auto bg-gray-100 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-200 transition-colors"
            >
              帶入本季區間
            </button>
          </div>
          <p class="text-[11px] font-medium text-gray-400">目前結算區間：{{ selectedPeriodLabel }}</p>
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

    <div class="bg-white p-5 md:p-6 rounded-2xl border border-gray-100 shadow-sm">
      <div class="flex flex-col gap-1 mb-4">
        <p class="text-xs font-bold uppercase tracking-[0.24em] text-primary/70">{{ selectedPeriodLabel }} 區間總結</p>
        <div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h3 class="text-lg font-black text-gray-800">球員季費摘要</h3>
          <p class="text-xs text-gray-400">摘要依目前結算區間全部球員即時統計</p>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div
          v-for="card in quarterlySummaryCards"
          :key="card.key"
          :class="card.cardClass"
          class="rounded-2xl border p-4 md:p-5 shadow-sm"
        >
          <p :class="card.labelClass" class="text-sm font-bold">{{ card.label }}</p>
          <p :class="card.amountClass" class="mt-3 text-3xl font-black tracking-tight">
            {{ formatCurrency(card.amount) }}
          </p>
          <p :class="card.descriptionClass" class="mt-2 text-xs leading-relaxed">
            {{ card.description }}
          </p>
        </div>
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
               <button @click="handleDeleteRemittance(r)" class="flex items-center justify-center text-red-500 font-bold hover:bg-red-100 w-7 h-7 rounded transition-colors bg-red-50">
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
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">匯款日期</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">操作紀錄</th>
              <th class="py-3 px-4 text-center font-bold text-gray-500 text-sm whitespace-nowrap">繳費狀態</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-if="filteredFeesList.length === 0" class="hover:bg-gray-50/50">
              <td colspan="6" class="py-8 text-center text-gray-400 font-bold">
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
                  @change="handleAmountChange(fee)"
                />
              </td>
              <td class="py-3 px-4 text-center">
                <span class="text-sm font-mono text-gray-500">{{ fee.remittance_date || '-' }}</span>
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
                    @change="handlePaidToggle(fee)"
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
import { ref, onMounted, computed, watch, watchEffect } from 'vue'
import { supabase } from '@/services/supabase'
import { ElMessage, ElMessageBox } from 'element-plus'
import { BellFilled, Calendar, Check, Delete } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { useRoute } from 'vue-router'
import { useWindowSize } from '@vueuse/core'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'
import {
  buildSiblingGroupMap,
  normalizeSiblingIds,
  resolveLinkedMemberIds
} from '@/utils/siblingGroups'
import {
  buildQuarterlyFamilyKey,
  FULL_QUARTERLY_FEE_AMOUNT,
  getExpectedQuarterlyAmount,
  groupQuarterlyFeeRecordsByPayment,
  selectLatestQuarterlyRecord,
  sumQuarterlyFeeGroupAmount
} from '@/utils/quarterlyFeeFamilies'

const emit = defineEmits<{
  (e: 'summary-change', payload: {
    scope: 'quarterly'
    periodLabel: string
    total: number
    paid: number
    unpaid: number
    isReady: boolean
  }): void
}>()

const route = useRoute()
const highlightFeeId = computed(() => route.query.highlight_fee_id as string | undefined)
const highlightMemberId = computed(() => route.query.highlight_member_id as string | undefined)

const isLoading = ref(false)
const { width } = useWindowSize()

const getQuarterMonthRange = (date = dayjs()) => {
  const quarterStartMonth = Math.floor(date.month() / 3) * 3
  const start = date.startOf('year').month(quarterStartMonth).startOf('month')
  const end = start.add(2, 'month')
  return {
    startMonth: start.format('YYYY-MM'),
    endMonth: end.format('YYYY-MM')
  }
}

const initialQuarterRange = getQuarterMonthRange()
const selectedStartMonth = ref(initialQuarterRange.startMonth)
const selectedEndMonth = ref(initialQuarterRange.endMonth)

const selectedPeriodLabel = computed(() => {
  const start = dayjs(`${selectedStartMonth.value}-01`)
  const end = dayjs(`${selectedEndMonth.value}-01`)
  const isQuarterRange =
    start.isValid() &&
    end.isValid() &&
    start.year() === end.year() &&
    end.diff(start, 'month') === 2 &&
    start.month() % 3 === 0

  if (isQuarterRange) {
    return `${start.year()}-Q${Math.floor(start.month() / 3) + 1}`
  }

  return `${selectedStartMonth.value} ~ ${selectedEndMonth.value}`
})

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

const DEFAULT_QUARTERLY_PAYMENT_ITEM = '學費(季繳$6000/3000)'

const cloneFeeValue = <T,>(value: T): T => {
  if (Array.isArray(value)) {
    return [...value] as T
  }

  return value
}

const markChanged = (fee: any) => {
  if (!pendingChanges.value.includes(fee.member_id)) {
    pendingChanges.value.push(fee.member_id)
  }
}

const applyUpdatesToFamilyRows = (
  fee: any,
  updates: Record<string, unknown>,
  options: { skipSelf?: boolean } = {}
) => {
  if (!fee.family_key) return

  feesList.value.forEach((item) => {
    if (item.family_key !== fee.family_key) return
    if (options.skipSelf && item.member_id === fee.member_id) return

    Object.entries(updates).forEach(([key, value]) => {
      item[key] = cloneFeeValue(value)
    })

    markChanged(item)
  })
}

const handleAmountChange = (fee: any) => {
  markChanged(fee)
}

const handlePaidToggle = (fee: any) => {
  applyUpdatesToFamilyRows(fee, {
    is_paid: fee.is_paid
  }, { skipSelf: true })
  markChanged(fee)
}

const formatCurrency = (amount: number) => {
  const normalizedAmount = Number(amount) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(normalizedAmount)
}

const getQuarterlyFeeAmount = (fee: any) => {
  return Number(fee.amount) || 0
}

const quarterlyFeeSummary = computed(() => {
  return feesList.value.reduce((summary, fee) => {
    const amount = getQuarterlyFeeAmount(fee)

    summary.total += amount
    if (fee.is_paid) {
      summary.paid += amount
    } else {
      summary.unpaid += amount
    }

    return summary
  }, {
    total: 0,
    paid: 0,
    unpaid: 0
  })
})

const quarterlySummaryCards = computed(() => {
  const summary = quarterlyFeeSummary.value

  return [
    {
      key: 'total',
      label: '本期應繳總額',
      amount: summary.total,
      description: '目前結算區間全部球員',
      cardClass: 'border-primary/20 bg-gradient-to-br from-primary/10 via-amber-50 to-white',
      labelClass: 'text-primary',
      amountClass: 'text-gray-900',
      descriptionClass: 'text-gray-500'
    },
    {
      key: 'paid',
      label: '本期已繳總額',
      amount: summary.paid,
      description: '目前結算區間已繳球員',
      cardClass: 'border-emerald-100 bg-emerald-50/80',
      labelClass: 'text-emerald-700',
      amountClass: 'text-emerald-700',
      descriptionClass: 'text-emerald-600/80'
    },
    {
      key: 'unpaid',
      label: '本期未繳總額',
      amount: summary.unpaid,
      description: '目前結算區間未繳球員',
      cardClass: 'border-amber-100 bg-amber-50/80',
      labelClass: 'text-amber-700',
      amountClass: 'text-amber-700',
      descriptionClass: 'text-amber-600/80'
    }
  ]
})

watchEffect(() => {
  const summary = quarterlyFeeSummary.value

  emit('summary-change', {
    scope: 'quarterly',
    periodLabel: selectedPeriodLabel.value,
    total: summary.total,
    paid: summary.paid,
    unpaid: summary.unpaid,
    isReady: !isLoading.value
  })
})

const formatTimestamp = (timestamp: string) => {
  if (!timestamp) return '-'
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm')
}

const normalizeMonthRange = () => {
  if (selectedEndMonth.value < selectedStartMonth.value) {
    selectedEndMonth.value = selectedStartMonth.value
  }
}

const handleStartMonthChange = () => {
  normalizeMonthRange()
  fetchData()
}

const handleEndMonthChange = () => {
  normalizeMonthRange()
  fetchData()
}

const resetToCurrentQuarter = () => {
  const currentQuarterRange = getQuarterMonthRange()
  selectedStartMonth.value = currentQuarterRange.startMonth
  selectedEndMonth.value = currentQuarterRange.endMonth
  fetchData()
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

const buildQuarterlyPayload = (fee: any, now: string) => ({
  member_id: fee.member_id,
  member_ids: [...fee.linked_member_ids],
  year_quarter: selectedPeriodLabel.value,
  amount: Number(fee.amount) || 0,
  payment_items: Array.isArray(fee.payment_items) ? [...fee.payment_items] : [],
  other_item_note: fee.payment_items.includes('加購其他項目:') ? fee.other_item_note : null,
  payment_method: fee.payment_method,
  account_last_5: ['銀行轉帳', '郵局無摺', 'ATM存款'].includes(fee.payment_method) ? fee.account_last_5 : null,
  remittance_date: fee.remittance_date,
  status: fee.is_paid ? 'paid' : 'unpaid',
  paid_at: fee.is_paid ? now : null,
  updated_at: now
})

const refreshRemittances = async () => {
  if (!currentPlayers.value.length) {
    playerRemittances.value = []
    return
  }

  await fetchRemittances(currentPlayers.value, buildSiblingGroupMap(currentPlayers.value))
}

const fetchData = async () => {
  isLoading.value = true
  pendingChanges.value = []
  feesList.value = []
  
  try {
    const { data: membersData, error: mErr } = await supabase
      .from('team_members')
      .select('id, name, status, sibling_ids, is_primary_payer, is_half_price, role')
      .in('role', ['球員'])
      
    if (mErr) throw mErr
    
    const members = normalizeSiblingIds(
      (membersData?.filter(m => m.status !== '退隊') || []).map((member) => ({
        ...member,
        sibling_ids: Array.isArray(member.sibling_ids) ? [...member.sibling_ids] : []
      }))
    )

    const siblingGroupMap = buildSiblingGroupMap(members)

    currentPlayers.value = members
    await fetchRemittances(members, siblingGroupMap)

    const { data: existingFees, error: fErr } = await supabase
      .from('quarterly_fees')
      .select('id, member_id, member_ids, year_quarter, payment_method, amount, created_at, updated_at, status, remittance_date, account_last_5, payment_items, other_item_note')
      .eq('year_quarter', selectedPeriodLabel.value)
      
    if (fErr) throw fErr
    
    const exactRecordMap = new Map<string, { record: any; linkedMemberIds: string[] }>()
    const familyRecordMap = new Map<string, Array<{ record: any; linkedMemberIds: string[] }>>()
    const sortedExistingFees = [...(existingFees || [])].sort((left, right) => {
      const rightTime = new Date(right.updated_at || right.created_at || 0).getTime()
      const leftTime = new Date(left.updated_at || left.created_at || 0).getTime()
      return rightTime - leftTime
    })

    sortedExistingFees.forEach((record) => {
      const linkedMemberIds = resolveLinkedMemberIds(record, siblingGroupMap)
      const familyKey = buildQuarterlyFamilyKey(linkedMemberIds)
      const familyRecords = familyRecordMap.get(familyKey) || []

      familyRecords.push({
        record,
        linkedMemberIds
      })
      familyRecordMap.set(familyKey, familyRecords)

      if (record.member_id && !exactRecordMap.has(record.member_id)) {
        exactRecordMap.set(record.member_id, {
          record,
          linkedMemberIds
        })
      }
    })

    feesList.value = members.map((member) => {
      const linkedMemberIds = siblingGroupMap.get(member.id) || [member.id]
      const familyKey = buildQuarterlyFamilyKey(linkedMemberIds)
      const ownRecordEntry = exactRecordMap.get(member.id)
      const familyRecordEntries = familyRecordMap.get(familyKey) || []
      const fallbackRecordEntry = ownRecordEntry || familyRecordEntries[0]
      const exactCoveredMemberIds = new Set(
        familyRecordEntries
          .map(({ record }) => record.member_id)
          .filter((recordMemberId): recordMemberId is string => linkedMemberIds.includes(recordMemberId))
      )
      const hasFullFamilyCoverage = exactCoveredMemberIds.size >= linkedMemberIds.length
      const expectedAmount = getExpectedQuarterlyAmount(member, members, siblingGroupMap)
      const baseRecord = ownRecordEntry?.record || fallbackRecordEntry?.record || null
      const storedAmount = Number(ownRecordEntry?.record?.amount)
      const hasFamilyPricingRule = linkedMemberIds.length > 1 || Boolean(member.is_half_price)
      const shouldUseExpectedAmount =
        !ownRecordEntry ||
        !hasFullFamilyCoverage ||
        (hasFamilyPricingRule && storedAmount !== expectedAmount)
      const rowAmount = shouldUseExpectedAmount
        ? expectedAmount
        : Number.isFinite(storedAmount)
          ? storedAmount
          : expectedAmount

      return {
        member_id: member.id,
        member_name: member.name,
        family_key: familyKey,
        record_id: ownRecordEntry?.record?.id || null,
        record_member_id: ownRecordEntry?.record?.member_id || member.id,
        record_member_ids: Array.isArray(baseRecord?.member_ids) ? [...baseRecord.member_ids] : [...linkedMemberIds],
        linked_member_ids: [...linkedMemberIds],
        amount: rowAmount,
        payment_items: Array.isArray(baseRecord?.payment_items) && baseRecord.payment_items.length > 0
          ? [...baseRecord.payment_items]
          : [DEFAULT_QUARTERLY_PAYMENT_ITEM],
        other_item_note: baseRecord?.other_item_note || '',
        payment_method: baseRecord?.payment_method || '銀行轉帳',
        account_last_5: baseRecord?.account_last_5 || '',
        remittance_date: baseRecord?.remittance_date || dayjs().format('YYYY-MM-DD'),
        is_paid: baseRecord ? baseRecord.status === 'paid' : false,
        is_discounted: expectedAmount < FULL_QUARTERLY_FEE_AMOUNT,
        expected_amount: expectedAmount
      }
    })

  } catch (err: any) {
    ElMessage.error('資料載入失敗: ' + err.message)
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

const fetchRemittances = async (
  players: any[],
  siblingGroupMap = buildSiblingGroupMap(players)
) => {
  try {
    const playerIds = new Set(players.map((player) => player.id))
    if (playerIds.size === 0) {
      playerRemittances.value = []
      return
    }

    const { data, error } = await supabase
      .from('quarterly_fees')
      .select('id, member_id, member_ids, year_quarter, payment_method, amount, created_at, updated_at, status, remittance_date, account_last_5, payment_items, other_item_note')
      .eq('year_quarter', selectedPeriodLabel.value)
      .or('status.is.null,status.neq.paid')
      .order('created_at', { ascending: false })
      .limit(30)
      
    if (error) throw error
    
    const relevantRecords = (data || []).filter((fee) => {
      const extractedIds = resolveLinkedMemberIds(fee, siblingGroupMap)
      const isPlayer = extractedIds.some((id) => playerIds.has(id))

      return isPlayer
    })

    playerRemittances.value = groupQuarterlyFeeRecordsByPayment(relevantRecords, siblingGroupMap)
      .map((group) => {
        const latestRecord = selectLatestQuarterlyRecord(group.records)
        const memberNames = group.linkedMemberIds
          .map((id) => players.find((player) => player.id === id)?.name)
          .filter(Boolean)
          .join(', ')

        return {
          ...(latestRecord || {}),
          id: String(latestRecord?.id || group.groupKey),
          record_ids: group.records.map((record: any) => record.id).filter(Boolean),
          group_key: group.groupKey,
          member_names: memberNames || '未知球員',
          extracted_member_ids: [...group.linkedMemberIds],
          amount: sumQuarterlyFeeGroupAmount(group.records),
          payment_items: Array.isArray(latestRecord?.payment_items) ? [...latestRecord.payment_items] : [],
          created_at: latestRecord?.created_at || null,
          updated_at: latestRecord?.updated_at || latestRecord?.created_at || null
        }
      })
      .sort((left, right) => {
        const rightTime = new Date(right.updated_at || right.created_at || 0).getTime()
        const leftTime = new Date(left.updated_at || left.created_at || 0).getTime()
        return rightTime - leftTime
      })
  } catch (err) {
    console.error('未能取得匯款紀錄', err)
  }
}

const saveAll = async () => {
  if (pendingChanges.value.length === 0) return
  isLoading.value = true
  
  try {
    const changedFees = feesList.value.filter(f => pendingChanges.value.includes(f.member_id))
    const processedMemberIds = new Set<string>()
    const now = new Date().toISOString()

    for (const fee of changedFees) {
      if (processedMemberIds.has(fee.member_id)) {
        continue
      }

      processedMemberIds.add(fee.member_id)
      const payload = buildQuarterlyPayload(fee, now)

      if (fee.record_id) {
        const { error } = await supabase.from('quarterly_fees').update(payload).eq('id', fee.record_id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('quarterly_fees')
          .insert([payload])
          .select('id, member_id, member_ids')

        if (error) throw error

        if (data && data.length > 0) {
          fee.record_id = data[0].id
          fee.record_member_id = data[0].member_id
          fee.record_member_ids = Array.isArray(data[0].member_ids) ? [...data[0].member_ids] : [...payload.member_ids]

          void dispatchPushNotification({
            title: `[新增匯款] 收到 ${fee.member_name} 的繳費登記`,
            body: `${selectedPeriodLabel.value}，金額 ${payload.amount} 元`,
            url: `/fees?member_id=${fee.member_id}`,
            feature: 'fees',
            action: 'VIEW',
            eventKey: buildPushEventKey('quarterly_fee', data[0].id)
          }).catch((pushError) => {
            console.warn('季費推播傳送失敗', pushError)
          })
        }
      }

      fee.linked_member_ids = [...payload.member_ids]
      fee.family_key = buildQuarterlyFamilyKey(payload.member_ids)
      fee.amount = payload.amount
    }

    await refreshRemittances()
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
    let synced = false

    if (remittance.extracted_member_ids && remittance.extracted_member_ids.length > 0) {
      remittance.extracted_member_ids.forEach((id: string) => {
        const feeItem = feesList.value.find((fee) => fee.member_id === id)
        if (feeItem && !feeItem.is_paid) {
          feeItem.is_paid = true
          handlePaidToggle(feeItem)
          synced = true
        }
      })
    }

    if (synced) {
      await saveAll()
    } else if (Array.isArray(remittance.record_ids) && remittance.record_ids.length > 0) {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('quarterly_fees')
        .update({ status: 'paid', paid_at: now })
        .in('id', remittance.record_ids)

      if (error) throw error

      await refreshRemittances()
    }
    
    ElMessage.success('款項確認成功，已標記為已繳納')
    playerRemittances.value = playerRemittances.value.filter(r => r.id !== remittance.id)
  } catch (err: any) {
    ElMessage.error('確認失敗: ' + err.message)
  }
}

const handleDeleteRemittance = async (remittance: any) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆回報表單嗎？', '刪除確認', { type: 'warning' })

    const recordIds = Array.isArray(remittance.record_ids) && remittance.record_ids.length > 0
      ? remittance.record_ids
      : [remittance.id]

    const { error } = await supabase.from('quarterly_fees').delete().in('id', recordIds)
    if (error) throw error

    ElMessage.success('已刪除紀錄')
    await fetchData()
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
    applyUpdatesToFamilyRows(feeItem, {
      remittance_date: feeItem.remittance_date,
      account_last_5: feeItem.account_last_5,
      payment_method: feeItem.payment_method,
      payment_items: [...feeItem.payment_items],
      other_item_note: feeItem.other_item_note
    }, { skipSelf: true })
    markChanged(feeItem)
  }
  editDialogVisible.value = false
}

const exportCSV = () => {
  if (filteredFeesList.value.length === 0) {
    ElMessage.warning('目前沒有結算資料可匯出')
    return
  }

  const headers = ['球員姓名', '項目與明細', '應繳金額', '匯款日期', '是否繳交流水']
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
      fee.remittance_date || '-',
      fee.is_paid ? '已繳' : '未繳'
    ])
  })

  // 加入 BOM (\uFEFF) 防止 Excel 亂碼
  const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  
  link.setAttribute('href', url)
  link.setAttribute('download', `球員季費結算表_${selectedPeriodLabel.value}.csv`)
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
