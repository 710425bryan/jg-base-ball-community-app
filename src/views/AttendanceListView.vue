<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-0 md:pb-6 bg-background text-text overflow-hidden">
    <!-- 頂部標題與操作區 -->
    <div class="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4 shrink-0">
      <AppPageHeader
        title="點名管理系統"
        subtitle="中港熊戰・Attendance"
        :icon="Checked"
        as="h2"
      >
        <template #actions>
          <button v-if="hasAccess" @click="openCreateModal()" class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-5 py-2.5 rounded-lg shadow-md text-sm font-bold transition-all flex items-center gap-2 tracking-normal">
            <el-icon><Plus /></el-icon>
            建立點名單
          </button>
        </template>
      </AppPageHeader>
    </div>

    <!-- 內容展示區 -->
    <div class="flex-1 overflow-y-auto min-h-0 pb-4 relative custom-scrollbar pr-2">
      <AppLoadingState v-if="isLoading" text="讀取點名紀錄中..." min-height="50vh" />

      <div v-else-if="events.length === 0" class="flex flex-col justify-center items-center h-full text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        <span class="font-bold text-lg tracking-widest">尚未建立任何點名紀錄</span>
      </div>
      
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <button v-if="canDelete" @click.stop="confirmDelete(event)" class="text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 p-1.5 rounded-lg border border-gray-100 hover:border-red-100 transition-colors" title="刪除點名單">
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
            <button class="text-primary font-bold text-sm bg-primary/10 px-3 py-1.5 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors flex items-center gap-1">
              開始點名
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
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
        <div class="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <button @click="isModalOpen = false" class="px-5 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">取消</button>
          <button @click="submitCreate" :disabled="isSubmitting" class="px-6 py-2 bg-primary hover:bg-primary-hover active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2">
            <el-icon v-if="isSubmitting" class="is-loading"><Loading /></el-icon>
            建立並開始點名
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Checked, Loading, Plus } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import dayjs from 'dayjs'

const router = useRouter()
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const hasAccess = computed(() => permissionsStore.can('attendance', 'CREATE'))
const canDelete = computed(() => permissionsStore.can('attendance', 'DELETE'))

const isLoading = ref(true)
const events = ref<any[]>([])

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
  isLoading.value = true
  try {
    // 先取得目前有效球員總數，作為尚未進行點名（records 為 0）時的總數參考
    const { count: memberCount } = await supabase
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .in('role', ['球員', '校隊'])
      .neq('status', '退隊')

    const { data, error } = await supabase
      .from('attendance_events')
      .select('*, profiles(name, nickname), attendance_records(status)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      
    if (error) throw error
    events.value = data?.map((e: any) => {
      const records = e.attendance_records || []
      const presentCount = records.filter((r: any) => ['出席', '遲到', '早退'].includes(r.status)).length
      const leaveCount = records.filter((r: any) => r.status === '請假').length
      const absentCount = records.filter((r: any) => r.status === '缺席').length
      // 如果還沒進行過點名儲存，就顯示目前系統活躍球員總數
      const totalCount = records.length > 0 ? records.length : (memberCount || 0)
      return { ...e, presentCount, leaveCount, absentCount, totalCount }
    }) || []
  } catch (error: any) {
    ElMessage.error('讀取紀錄失敗：' + error.message)
  } finally {
    isLoading.value = false
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

    // 自動為所有現役球員/校隊產生預設點名紀錄 (狀態：請假)
    const { data: members, error: memError } = await supabase
      .from('team_members')
      .select('id')
      .in('role', ['球員', '校隊'])
      .neq('status', '退隊')
      
    if (!memError && members && members.length > 0) {
      const recordsPayload = members.map(m => ({
        event_id: evData.id,
        member_id: m.id,
        status: '請假'
      }))
      // 批次插入，忽略錯誤
      await supabase.from('attendance_records').insert(recordsPayload)
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

const confirmDelete = async (event: any) => {
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

onMounted(() => {
  fetchEvents()
})
</script>

<style scoped>
.custom-dialog.el-dialog {
  border-radius: 16px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
}
</style>
