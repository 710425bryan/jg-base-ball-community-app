<template>
  <div class="min-h-full min-w-0 flex flex-col relative animate-fade-in p-3 md:p-6 pb-5 md:pb-6 bg-background text-text">
    <!-- 頂部標題與操作區 -->
    <div class="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4 shrink-0">
      <AppPageHeader
        title="點名管理系統"
        subtitle="中港熊戰・Attendance"
        :icon="Checked"
        as="h2"
      >
        <template #actions>
          <button v-if="hasAccess" type="button" @click="openCreateModal()" class="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold tracking-normal text-white shadow-md transition-all hover:bg-primary-hover active:scale-95">
            <el-icon><Plus /></el-icon>
            建立點名單
          </button>
        </template>
      </AppPageHeader>
    </div>

    <div class="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 md:flex-row md:items-end md:justify-between">
      <div class="flex min-w-0 flex-col gap-2 md:flex-row md:items-end">
        <div class="min-w-0 md:w-52">
          <label for="attendance-month" class="mb-1 block text-sm font-bold text-slate-600">查詢月份</label>
          <el-date-picker
            id="attendance-month"
            v-model="selectedMonth"
            type="month"
            format="YYYY 年 MM 月"
            value-format="YYYY-MM"
            placeholder="選擇查詢月份"
            :clearable="false"
            size="large"
            class="!h-11 !w-full"
          />
        </div>
        <el-button size="large" class="!ml-0 !min-h-11" @click="selectedMonth = getCurrentTaipeiMonth()">回到本月</el-button>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="text-sm text-slate-500" aria-live="polite">{{ isLoading ? '讀取中…' : loadError ? '讀取失敗' : `共 ${events.length} 筆` }}</span>
        <ViewModeSwitch v-model="viewMode" grid-label="卡片" table-label="表格" />
      </div>
    </div>

    <!-- 內容展示區 -->
    <div class="relative min-h-0 min-w-0 flex-1 pb-5">
      <AppLoadingState v-if="isLoading" text="讀取點名紀錄中..." min-height="50vh" />

      <div v-else-if="loadError" class="flex min-h-60 flex-col items-center justify-center gap-3 text-center" role="alert">
        <p class="text-red-600">{{ loadError }}</p>
        <el-button class="!min-h-11" @click="fetchEvents">重新載入</el-button>
      </div>

      <div v-else-if="events.length === 0" class="flex min-h-60 flex-col justify-center items-center text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        <span class="font-bold text-lg">所選月份尚無點名紀錄</span>
        <span class="mt-2 text-sm">可切換月份查詢其他日期的點名單</span>
      </div>
      
      <div v-else-if="viewMode === 'grid'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-test="attendance-cards">
        <div v-for="event in events" :key="event.id" 
             class="bg-white rounded-xl p-4 md:p-5 border border-gray-200 hover:border-primary/50 hover:shadow-lg transition-all duration-300 relative group cursor-pointer shadow-sm flex flex-col"
             @click="goToRollCall(event.id)">
             
          <div class="flex justify-between items-start mb-3">
            <div class="flex flex-col gap-1">
              <span class="text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider w-fit" :class="getTypeClass(event.event_type)">{{ event.event_type }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 flex items-center gap-1">
                <el-icon><Calendar /></el-icon>
                {{ event.date }}
              </span>
              <button v-if="canDelete" type="button" @click.stop="confirmDelete(event)" class="app-icon-button !border-gray-100 !bg-gray-50 !text-gray-400 hover:!border-red-100 hover:!bg-red-50 hover:!text-red-500" aria-label="刪除點名單" title="刪除點名單">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
          
          <h3 class="text-xl font-black text-slate-800 mb-2 line-clamp-2 leading-snug">{{ event.title }}</h3>
          
          <!-- 出席狀況概覽 -->
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <div class="flex items-center gap-1 bg-gray-50 text-gray-600 px-2 py-0.5 rounded text-xs font-extrabold border border-gray-200 tracking-wide">
              👥 總數 {{ event.totalCount }} 人
            </div>
            <div class="flex items-center gap-1 bg-green-50 text-green-600 px-2 py-0.5 rounded text-xs font-extrabold border border-green-100 tracking-wide">
              ✅ 出席 {{ event.presentCount }} 人
            </div>
            <div v-if="event.absentCount > 0" class="flex items-center gap-1 bg-red-50 text-red-500 px-2 py-0.5 rounded text-xs font-extrabold border border-red-100 tracking-wide">
              ❌ 缺席 {{ event.absentCount }} 人
            </div>
            <div class="flex items-center gap-1 bg-blue-50 text-blue-500 px-2 py-0.5 rounded text-xs font-extrabold border border-blue-100 tracking-wide">
              🏖️ 請假 {{ event.leaveCount }} 人
            </div>
          </div>
          
          <div class="mt-auto pt-4 flex items-center justify-between border-t border-gray-50">
            <div class="text-sm font-bold text-gray-400">建立者: <span class="text-gray-600">{{ event.profiles?.nickname || event.profiles?.name || '未知' }}</span></div>
            <button type="button" class="flex min-h-11 items-center gap-1 rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-white">
              開始點名
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div v-else class="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white" data-test="attendance-table" role="region" aria-label="點名紀錄表格，可左右捲動" tabindex="0">
        <table class="w-full min-w-[860px] text-left text-sm">
          <caption class="sr-only">{{ selectedMonth }} 點名紀錄</caption>
          <thead class="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" class="whitespace-nowrap px-4 py-3">日期</th>
              <th scope="col" class="px-4 py-3">點名單標題</th>
              <th scope="col" class="whitespace-nowrap px-4 py-3">活動類型</th>
              <th scope="col" class="whitespace-nowrap px-3 py-3 text-center">總數</th>
              <th scope="col" class="whitespace-nowrap px-3 py-3 text-center">出席</th>
              <th scope="col" class="whitespace-nowrap px-3 py-3 text-center">請假</th>
              <th scope="col" class="whitespace-nowrap px-3 py-3 text-center">缺席</th>
              <th scope="col" class="whitespace-nowrap px-4 py-3">建立者</th>
              <th scope="col" class="px-4 py-3">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="event in events" :key="event.id" class="hover:bg-slate-50">
              <td class="whitespace-nowrap px-4 py-3 text-slate-600">{{ event.date }}</td>
              <th scope="row" class="min-w-48 max-w-xs break-words px-4 py-3 font-bold text-slate-800">{{ event.title }}</th>
              <td class="px-4 py-3"><span class="whitespace-nowrap rounded px-2 py-1 text-xs font-bold" :class="getTypeClass(event.event_type)">{{ event.event_type }}</span></td>
              <td class="px-3 py-3 text-center">{{ event.totalCount }}</td>
              <td class="px-3 py-3 text-center text-green-600">{{ event.presentCount }}</td>
              <td class="px-3 py-3 text-center text-blue-500">{{ event.leaveCount }}</td>
              <td class="px-3 py-3 text-center" :class="event.absentCount > 0 ? 'text-red-500' : 'text-slate-400'">{{ event.absentCount }}</td>
              <td class="px-4 py-3">{{ event.profiles?.nickname || event.profiles?.name || '未知' }}</td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <button type="button" class="min-h-11 whitespace-nowrap rounded-xl bg-primary/10 px-3 font-bold text-primary hover:bg-primary/20" @click="goToRollCall(event.id)">開始點名</button>
                  <button v-if="canDelete" type="button" class="app-icon-button !text-red-500 hover:!bg-red-50" aria-label="刪除點名單" title="刪除點名單" @click="confirmDelete(event)"><el-icon><Delete /></el-icon></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 新增點名單 Modal -->
    <el-dialog
      v-model="isModalOpen"
      title="建立新點名單"
      width="90%"
      style="max-width: 500px; border-radius: 16px;"
      :show-close="false"
      class="custom-dialog"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" class="mt-2 space-y-4">
        <el-form-item label="點名單標題" prop="title" class="font-bold">
          <el-input v-model="form.title" placeholder="例如：週六早安練球" size="large" />
        </el-form-item>
        <el-form-item label="活動類型" prop="event_type" class="font-bold">
          <el-select v-model="form.event_type" class="w-full" size="large">
            <el-option label="練習" value="練習" />
            <el-option label="特訓課" value="特訓課" />
            <el-option label="比賽" value="比賽" />
            <el-option label="活動" value="活動" />
            <el-option label="會議" value="會議" />
          </el-select>
        </el-form-item>
        <el-form-item label="活動日期" prop="date" class="font-bold">
          <el-date-picker v-model="form.date" type="date" placeholder="選擇日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" class="!w-full" size="large" />
        </el-form-item>
      </el-form>

      <template #footer>
        <AppDialogFooter
          confirm-label="建立並開始點名"
          :loading="isSubmitting"
          @cancel="isModalOpen = false"
          @confirm="submitCreate"
        />
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Checked, Delete, Plus } from '@element-plus/icons-vue'
import ViewModeSwitch from '@/components/ViewModeSwitch.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import {
  buildAttendanceLeaveSummaryRows,
  filterAttendanceLeaveRecordsForEvent,
  getDefaultAttendanceStatusForMember
} from '@/utils/attendanceLeave'
import dayjs from 'dayjs'
import { getCurrentTaipeiMonth } from '@/utils/trainingMonthDates'
import { listAttendanceEvents } from '@/services/attendanceEvents'
import type { AttendanceEventSummary } from '@/types/attendance'

const router = useRouter()
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const hasAccess = computed(() => permissionsStore.can('attendance', 'CREATE'))
const canDelete = computed(() => permissionsStore.can('attendance', 'DELETE'))

const isLoading = ref(true)
const events = ref<AttendanceEventSummary[]>([])
const selectedMonth = ref(getCurrentTaipeiMonth())
const viewMode = ref<'grid' | 'table'>('grid')
const loadError = ref('')
let fetchId = 0

// Modal Form
const isModalOpen = ref(false)
const isSubmitting = ref(false)
const formRef = ref()

const initialForm = {
  title: '',
  date: dayjs().format('YYYY-MM-DD'),
  event_type: '練習'
}
const form = reactive({ ...initialForm })

const rules = {
  title: [{ required: true, message: '請填寫標題', trigger: 'blur' }],
  date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
  event_type: [{ required: true, message: '請選擇類型', trigger: 'change' }]
}

const fetchEvents = async () => {
  const requestId = ++fetchId
  isLoading.value = true
  loadError.value = ''
  events.value = []
  try {
    const data = await listAttendanceEvents(selectedMonth.value)
    if (requestId === fetchId) events.value = data
  } catch (error: any) {
    if (requestId === fetchId) loadError.value = '讀取紀錄失敗：' + (error.message || '請稍後再試')
  } finally {
    if (requestId === fetchId) isLoading.value = false
  }
}

const openCreateModal = () => {
  Object.assign(form, initialForm)
  if(formRef.value) formRef.value.clearValidate()
  isModalOpen.value = true
}

const submitCreate = async () => {
  if (!formRef.value) return
  try {
    const valid = await formRef.value.validate()
    if (!valid) return
  } catch (err) {
    return
  }
  
  isSubmitting.value = true
  try {
    const { data: members, error: memberError } = await supabase
      .from('team_members')
      .select('id')
      .in('role', ['球員', '校隊'])
      .neq('status', '退隊')
      .or('fee_billing_mode.is.null,fee_billing_mode.neq.no_fee')

    if (memberError) throw memberError

    let leaveMemberIds = new Set<string>()
    if (members && members.length > 0) {
      const { data: leaves, error: leaveError } = await supabase
        .from('leave_requests')
        .select(`
          id, user_id, leave_type, leave_time_segment, start_date, end_date, reason,
          team_members ( id, name, avatar_url, role, jersey_number, status, team_group )
        `)
        .lte('start_date', form.date)
        .gte('end_date', form.date)

      if (leaveError) throw leaveError
      leaveMemberIds = new Set(
        buildAttendanceLeaveSummaryRows(filterAttendanceLeaveRecordsForEvent(leaves), members)
          .filter((row) => row.in_roll_call_list)
          .map((row) => row.member_id)
          .filter(Boolean)
      )
    }

    const payload = {
      title: form.title,
      date: form.date,
      event_type: form.event_type,
      created_by: authStore.user?.id
    }
    
    // Insert and fetch back the created row ID
    const { data: evData, error } = await supabase
      .from('attendance_events')
      .insert(payload)
      .select()
      .single()
      
    if (error) throw error

    // 建立時只預寫當天有假單的球員；其他球員等實際點選出席 / 請假時再寫入。
    if (members && members.length > 0 && leaveMemberIds.size > 0) {
      const recordsPayload = members
        .map(m => ({
          event_id: evData.id,
          member_id: m.id,
          status: getDefaultAttendanceStatusForMember(m.id, leaveMemberIds)
        }))
        .filter(record => record.status === '請假')

      if (recordsPayload.length > 0) {
        const { error: recordError } = await supabase.from('attendance_records').insert(recordsPayload)
        if (recordError) throw recordError
      }
    }
    
    ElMessage.success('建立成功！即將進入點名畫面...')
    isModalOpen.value = false
    
    // Navigate immediately to roll call
    router.push(`/attendance/${evData.id}`)
    
  } catch (error: any) {
    console.error("Submit Error:", error)
    ElMessage.error(error.message || '發生錯誤')
  } finally {
    isSubmitting.value = false
  }
}

const confirmDelete = async (event: AttendanceEventSummary) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${event.title}」這筆紀錄嗎？這將會連帶刪除所有出缺勤資料，此操作無法復原！`,
      '⚠️ 刪除確認',
      { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error', buttonSize: 'large' }
    )
    
    // 執行刪除
    const { error } = await supabase.from('attendance_events').delete().eq('id', event.id)
    if (error) throw error
    
    ElMessage.success('刪除成功')
    fetchEvents()
  } catch (err: any) {
    if (err !== 'cancel') {
      console.error(err)
      ElMessage.error('刪除失敗：' + (err.message || '發生錯誤'))
    }
  }
}

const goToRollCall = (id: string) => {
  router.push(`/attendance/${id}`)
}

const getTypeClass = (type: string) => {
  switch (type) {
    case '比賽': return 'bg-red-100 text-red-600 border border-red-200'
    case '特訓課': return 'bg-amber-100 text-amber-700 border border-amber-200'
    case '練習': return 'bg-primary/10 text-primary border border-primary/20'
    case '活動': return 'bg-purple-100 text-purple-600 border border-purple-200'
    default: return 'bg-gray-100 text-gray-600 border border-gray-200'
  }
}

watch(selectedMonth, fetchEvents, { immediate: true })
onBeforeUnmount(() => { fetchId += 1 })
</script>

<style scoped>
.custom-dialog.el-dialog {
  border-radius: 16px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
}
</style>
