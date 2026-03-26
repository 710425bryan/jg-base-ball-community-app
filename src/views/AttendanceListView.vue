<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-20 md:pb-6 bg-background text-text overflow-hidden">
    <!-- 頂部標題與操作區 -->
    <div class="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4 shrink-0">
      <div class="flex items-center gap-4">
        <!-- Logo -->
        <div class="w-12 h-12 bg-white rounded-xl border-2 border-primary flex items-center justify-center shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 class="text-2xl md:text-3xl font-black text-slate-800 tracking-wider flex items-center gap-2">
            點名管理系統
          </h2>
          <p class="text-secondary font-bold text-sm mt-1 uppercase tracking-[0.1em]">
            中港熊戰・Attendance
          </p>
        </div>
      </div>
      
      <div class="flex items-center gap-3">
        <button v-if="hasAccess" @click="openCreateModal()" class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-5 py-2.5 rounded-lg shadow-md text-sm font-bold transition-all flex items-center gap-2 tracking-wide">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          建立點名單
        </button>
      </div>
    </div>

    <!-- 內容展示區 -->
    <div class="flex-1 overflow-y-auto min-h-0 pb-4 relative custom-scrollbar pr-2" v-loading="isLoading" element-loading-background="rgba(255, 255, 255, 0.8)">
      <div v-if="events.length === 0 && !isLoading" class="flex flex-col justify-center items-center h-full text-slate-500">
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
            <span class="text-sm font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 flex items-center gap-1">
              <el-icon><Calendar /></el-icon>
              {{ event.date }}
            </span>
          </div>
          
          <h3 class="text-xl font-black text-slate-800 mb-2 line-clamp-2 leading-snug">{{ event.title }}</h3>
          
          <!-- 出席狀況概覽 (可選功能：未來若能在這顯示出席率會更好) -->
          <div class="mt-auto pt-4 flex items-center justify-between border-t border-gray-50">
            <div class="text-sm font-bold text-gray-400">建立者: <span class="text-gray-600">{{ event.profiles?.name || '未知' }}</span></div>
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
import { ElMessage } from 'element-plus'
import { Calendar, Loading } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const router = useRouter()
const authStore = useAuthStore()
const hasAccess = computed(() => ['ADMIN', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role))

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
    const { data, error } = await supabase
      .from('attendance_events')
      .select('*, profiles(name)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      
    if (error) throw error
    events.value = data || []
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
    const { data, error } = await supabase
      .from('attendance_events')
      .insert(payload)
      .select()
      .single()
      
    if (error) throw error
    
    ElMessage.success('建立成功！即將進入點名畫面...')
    isModalOpen.value = false
    
    // Navigate immediately to roll call
    router.push(`/attendance/${data.id}`)
    
  } catch (error: any) {
    console.error("Submit Error:", error)
    ElMessage.error(error.message || '發生錯誤')
  } finally {
    isSubmitting.value = false
  }
}

const goToRollCall = (id: string) => {
  router.push(`/attendance/${id}`)
}

const getTypeClass = (type: string) => {
  switch (type) {
    case '比賽': return 'bg-red-100 text-red-600 border border-red-200'
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
