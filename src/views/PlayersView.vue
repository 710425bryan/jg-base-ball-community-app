<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-20 md:pb-6 bg-background text-text overflow-hidden">
    <!-- 頂部標題與操作區 -->
    <div class="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4 shrink-0">
      <div class="flex items-center gap-4">
        <!-- 黑熊 Logo -->
        <div class="w-12 h-12 bg-white rounded-xl border-2 border-primary flex items-center justify-center shadow-sm">
          <span class="text-2xl">🐻</span>
        </div>
        <div>
          <h2 class="text-3xl font-black text-slate-800 tracking-wider flex items-center gap-2">
            球員名單
          </h2>
          <p class="text-secondary font-bold text-sm mt-1 uppercase tracking-[0.2em] flex items-center gap-2">
            中港熊戰<span class="w-10 h-0.5 bg-secondary inline-block"></span>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <!-- 切換顯示模式 -->
        <div class="bg-gray-100 p-1 rounded-lg flex items-center shadow-inner">
          <button @click="viewMode = 'grid'" :class="['px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5', viewMode === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600']">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            <span class="hidden sm:inline">卡片</span>
          </button>
          <button @click="viewMode = 'table'" :class="['px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5', viewMode === 'table' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600']">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            <span class="hidden sm:inline">表格</span>
          </button>
        </div>
        
        <button v-if="isAdmin" @click="openCreateModal()" class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-5 py-2.5 rounded-lg shadow-md text-sm font-bold transition-all flex items-center gap-2 tracking-wide">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          新增成員
        </button>
      </div>
    </div>

    <!-- 頁籤與過濾區 -->
    <div class="mb-4 shrink-0">
      <el-tabs v-model="activeTab" class="w-full light-tabs">
        <el-tab-pane label="全體人員" name="全部" />
        <el-tab-pane label="球員列表" name="球員" />
        <el-tab-pane label="教練團隊" name="教練" />
        <el-tab-pane label="管理團隊" name="管理群" />
        <el-tab-pane label="其他" name="其他" />
      </el-tabs>
    </div>

    <!-- 內容展示區 -->
    <div class="flex-1 overflow-y-auto min-h-0 pb-4 relative custom-scrollbar pr-2" v-loading="isLoading" element-loading-background="rgba(255, 255, 255, 0.8)">
      <div v-if="filteredMembers.length === 0 && !isLoading" class="flex flex-col justify-center items-center h-full text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        <span class="font-bold text-lg tracking-widest">NO DATA</span>
      </div>
      
      <!-- 表格模式 -->
      <div v-else-if="viewMode === 'table'" class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-[calc(100vh-230px)] flex flex-col">
        <el-table :data="filteredMembers" style="width: 100%" height="100%" row-class-name="cursor-pointer" @row-click="openEditModal" :header-cell-style="{ background: '#f8fafc', color: '#475569', fontWeight: 'bold', whiteSpace: 'nowrap' }">
          <el-table-column width="65" align="center" fixed="left">
            <template #default="{ row }">
              <el-avatar :src="row.avatar_url" shape="circle" :size="36" class="bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                <template #default>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 mt-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
                </template>
              </el-avatar>
            </template>
          </el-table-column>
          <el-table-column prop="name" label="姓名" min-width="120" fixed="left" class-name="font-black text-gray-800 text-base" />
          <el-table-column prop="role" label="身分" width="100">
            <template #default="{ row }">
              <span class="text-[10px] md:text-xs font-bold px-2 py-0.5 rounded border uppercase tracking-wider" :class="getRoleClass(row.role)">{{ row.role }}</span>
            </template>
          </el-table-column>
          <el-table-column label="打/投" width="100" align="center">
            <template #default="{ row }">
              <span v-if="row.throwing_hand && row.batting_hand" class="text-xs font-mono font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                {{ row.throwing_hand.slice(0,1) }}/{{ row.batting_hand.slice(0,1) }}
              </span>
              <span v-else class="text-gray-300">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="guardian_name" label="法定代理人" min-width="120" />
          <el-table-column prop="contact_line_id" label="LINE ID" min-width="140" />
          <el-table-column prop="national_id" label="身分證" width="120">
            <template #default="{ row }">
              <span v-if="row.national_id" class="text-xs font-mono text-gray-400">{{ row.national_id.slice(0, 4) }}***</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 卡片模式 -->
      <div v-else class="flex flex-col gap-3">
        <div v-for="member in filteredMembers" :key="member.id" 
             class="bg-white rounded-xl p-3 md:p-4 border border-gray-200 hover:border-primary/50 hover:shadow-md transition-all duration-300 relative group cursor-pointer flex items-center justify-between shadow-sm"
             @click="openEditModal(member)">
          
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 md:w-16 md:h-16 rounded-full border-2 border-gray-100 group-hover:border-primary flex items-center justify-center text-gray-400 overflow-hidden relative shrink-0 transition-colors bg-gray-50">
              <img v-if="member.avatar_url" :src="member.avatar_url" class="w-full h-full object-cover" />
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
            </div>
            
            <div class="flex flex-col gap-1 text-left">
              <div class="font-black text-slate-800 md:text-xl tracking-wide flex items-center gap-2">
                {{ member.name }}
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-xs md:text-sm font-bold px-2 py-0.5 rounded border uppercase tracking-wider" :class="getRoleClass(member.role)">[{{ member.role }}]</span>
                <span v-if="member.throwing_hand && member.batting_hand" class="text-xs md:text-sm font-mono font-bold text-gray-500 px-2 py-0.5 rounded bg-gray-100 border border-gray-200">
                  {{ member.throwing_hand.slice(0,1) }}/{{ member.batting_hand.slice(0,1) }}
                </span>
                <span v-if="member.national_id" class="text-xs md:text-sm font-mono text-gray-400 hidden sm:inline-block">
                  ID: {{ member.national_id.slice(0, 4) }}***
                </span>
              </div>
            </div>
          </div>
          
          <div class="flex items-center gap-4">
            <div class="hidden md:flex flex-col text-right">
              <span class="text-xs uppercase font-bold tracking-widest text-gray-400">Status</span>
              <span class="text-sm font-black text-green-500">ACTIVE</span>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- 新增/編輯 Modal -->
    <el-dialog
      v-model="isModalOpen"
      :title="isEditing ? '編輯隊職員資料' : '新增隊職員'"
      width="95%"
      style="max-width: 700px; border-radius: 16px;"
      :show-close="false"
      class="custom-dialog"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" class="mt-4 space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        
        <!-- 大頭貼上傳 -->
        <div class="flex justify-center mb-6">
          <div class="relative group cursor-pointer">
            <div class="w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-4 border-white shadow-lg flex items-center justify-center">
              <img v-if="previewAvatar" :src="previewAvatar" class="w-full h-full object-cover"/>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-gray-300" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
            </div>
            <label class="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-md cursor-pointer hover:bg-primary/90 transition-transform hover:scale-105 active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <input type="file" class="hidden" accept="image/*" @change="handleFileSelect" />
            </label>
          </div>
        </div>

        <!-- 區塊1: 基本資料 -->
        <div class="bg-gray-50/50 p-4 rounded-xl border border-gray-100 relative">
          <div class="absolute -top-3 left-4 bg-white px-2 text-sm font-bold text-gray-500 uppercase tracking-wider">個人資料</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <el-form-item label="姓名" prop="name" class="font-bold mb-0">
              <el-input v-model="form.name" placeholder="隊職員姓名" />
            </el-form-item>
            <el-form-item label="身分" prop="role" class="font-bold mb-0">
              <el-select v-model="form.role" class="w-full">
                <el-option label="球員" value="球員" />
                <el-option label="教練" value="教練" />
                <el-option label="管理群" value="管理群" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
            <el-form-item label="生日 (西元年)" prop="birth_date" class="font-bold mb-0">
              <el-date-picker v-model="form.birth_date" type="date" placeholder="選擇生日" format="YYYY-MM-DD" value-format="YYYY-MM-DD" class="!w-full" />
            </el-form-item>
            <el-form-item label="身分證字號" prop="national_id" class="font-bold mb-0">
              <el-input v-model="form.national_id" placeholder="身分證字號" />
            </el-form-item>
            <el-form-item prop="is_early_enrollment" class="font-bold mb-0 flex items-center h-[52px]">
              <template #label>
                <div class="inline-flex items-center gap-1 leading-none mr-3">提早入學 <el-tooltip content="9/2以後出生，但提前就讀" placement="top"><el-icon class="text-gray-400 cursor-help"><InfoFilled /></el-icon></el-tooltip></div>
              </template>
              <el-switch v-model="form.is_early_enrollment" active-text="有" inactive-text="無" />
            </el-form-item>
          </div>
        </div>

        <!-- 區塊2: 棒球屬性 -->
        <div class="bg-gray-50/50 p-4 rounded-xl border border-gray-100 relative" v-if="form.role === '球員' || form.role === '教練'">
          <div class="absolute -top-3 left-4 bg-white px-2 text-sm font-bold text-gray-500 uppercase tracking-wider">棒球屬性</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <el-form-item label="投球慣用手" prop="throwing_hand" class="font-bold mb-0">
              <el-select v-model="form.throwing_hand" class="w-full" clearable>
                <el-option label="右投" value="右投" />
                <el-option label="左投" value="左投" />
                <el-option label="左右開弓" value="左右開弓" />
              </el-select>
            </el-form-item>
            <el-form-item label="打擊慣用方向" prop="batting_hand" class="font-bold mb-0">
              <el-select v-model="form.batting_hand" class="w-full" clearable>
                <el-option label="右打" value="右打" />
                <el-option label="左打" value="左打" />
                <el-option label="左右開弓" value="左右開弓" />
              </el-select>
            </el-form-item>
          </div>
        </div>

        <!-- 區塊3: 聯絡資訊 -->
        <div class="bg-gray-50/50 p-4 rounded-xl border border-gray-100 relative">
          <div class="absolute -top-3 left-4 bg-white px-2 text-sm font-bold text-gray-500 uppercase tracking-wider">聯絡資訊</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <el-form-item label="主要聯絡人 LINE ID" prop="contact_line_id" class="font-bold mb-0">
              <el-input v-model="form.contact_line_id" placeholder="LINE ID" />
            </el-form-item>
            <el-form-item label="主要聯絡人關係" prop="contact_relation" class="font-bold mb-0">
              <el-select v-model="form.contact_relation" class="w-full" clearable>
                <el-option label="爸爸" value="爸爸" />
                <el-option label="媽媽" value="媽媽" />
                <el-option label="阿公" value="阿公" />
                <el-option label="阿媽" value="阿媽" />
                <el-option label="自己" value="自己" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
            <el-form-item label="法定代理人 (姓名)" prop="guardian_name" class="font-bold mb-0">
              <el-input v-model="form.guardian_name" placeholder="請填寫姓名" />
            </el-form-item>
            <el-form-item label="法定代理人 (手機)" prop="guardian_phone" class="font-bold mb-0">
              <el-input v-model="form.guardian_phone" placeholder="09XX-XXX-XXX" />
            </el-form-item>
          </div>
        </div>

        <!-- 區塊4: 條款與備註 -->
        <div class="bg-blue-50/30 p-4 rounded-xl border border-blue-100 relative">
          <div class="absolute -top-3 left-4 bg-white px-2 text-sm font-bold text-blue-500 uppercase tracking-wider">條款與其他</div>
          <div class="mt-4">
            <el-form-item prop="portrait_auth" class="mb-4">
              <div class="flex items-start gap-3 w-full bg-white p-4 rounded-xl border border-blue-50 shadow-sm">
                <el-checkbox v-model="form.portrait_auth" size="large" class="mt-1" />
                <div>
                  <div class="font-bold text-gray-800 text-sm mb-1 leading-tight">同意肖像授權</div>
                  <div class="text-sm leading-relaxed text-gray-500 p-0 text-balance text-left" style="white-space: normal;">
                    中港熊戰棒球隊為紀錄隊職員成長過程及參賽紀錄等，需進行活動影音紀錄，因此隊職員的肖像（包含活動照片及影片）可能會出現在臉書之公開粉絲專頁、臉書之私密社團、其他網路公開社群或學校活動海報。
                  </div>
                </div>
              </div>
            </el-form-item>
            
            <el-form-item label="備註" prop="notes" class="font-bold mb-0">
              <el-input v-model="form.notes" type="textarea" :rows="2" placeholder="附加說明或注意事項" />
            </el-form-item>
          </div>
        </div>

      </el-form>

      <template #footer>
        <div class="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
          <button v-if="isEditing" @click="confirmDelete" class="text-red-500 hover:text-red-600 hover:bg-red-50 font-bold px-4 py-2 rounded-lg transition-colors text-sm flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            刪除
          </button>
          <div v-else></div>

          <div class="flex gap-2">
            <button @click="isModalOpen = false" class="px-5 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">取消</button>
            <button @click="submitForm" :disabled="isSubmitting" class="px-6 py-2 bg-primary hover:bg-primary/90 active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center min-w-[100px]">
              <span v-if="isSubmitting" class="flex gap-2 items-center"><el-icon class="is-loading"><Loading /></el-icon> 儲存中</span>
              <span v-else>儲存資料</span>
            </button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, InfoFilled } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const isAdmin = computed(() => authStore.profile?.role === 'ADMIN')

const isLoading = ref(true)
const isSubmitting = ref(false)
const members = ref<any[]>([])
const activeTab = ref('全部')
const viewMode = ref<'grid' | 'table'>('table')

// 篩選列表
const filteredMembers = computed(() => {
  if (activeTab.value === '全部') return members.value
  return members.value.filter(m => m.role === activeTab.value)
})

// --- 表單狀態 ---
const isModalOpen = ref(false)
const isEditing = ref(false)
const formRef = ref()
const previewAvatar = ref('')
let selectedFile: File | null = null

const initialForm = {
  id: '',
  name: '',
  role: '球員',
  birth_date: '',
  is_early_enrollment: false,
  national_id: '',
  throwing_hand: '',
  batting_hand: '',
  contact_line_id: '',
  contact_relation: '',
  guardian_name: '',
  guardian_phone: '',
  portrait_auth: false,
  notes: '',
  avatar_url: ''
}

const form = reactive({ ...initialForm })

const rules = computed(() => ({
  name: [{ required: true, message: '請填寫姓名', trigger: 'blur' }],
  role: [{ required: true, message: '請選擇身分', trigger: 'change' }],
  birth_date: [{ required: true, message: '請選擇生日', trigger: 'change' }],
  national_id: [{ required: true, message: '請填寫身分證字號', trigger: 'blur' }],
  throwing_hand: [{ required: form.role === '球員' || form.role === '教練', message: '請選擇投球慣用手', trigger: 'change' }],
  batting_hand: [{ required: form.role === '球員' || form.role === '教練', message: '請選擇打擊慣用方向', trigger: 'change' }],
  contact_line_id: [{ required: true, message: '請填寫主要聯絡人 LINE ID', trigger: 'blur' }],
  contact_relation: [{ required: true, message: '請選擇主要聯絡人關係', trigger: 'change' }],
  guardian_name: [{ required: true, message: '請填寫法定代理人姓名', trigger: 'blur' }],
  guardian_phone: [{ required: true, message: '請填寫法定代理人手機', trigger: 'blur' }],
  portrait_auth: [{
    required: true,
    message: '請同意肖像授權',
    trigger: 'change',
    validator: (rule: any, value: boolean, callback: any) => {
      if (!value) callback(new Error('請同意肖像授權'))
      else callback()
    }
  }]
}))

// --- 讀取資料 ---
const fetchData = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('role')
      .order('name')
    if (error) throw error
    members.value = data || []
  } catch (error: any) {
    ElMessage.error('讀取名單失敗：' + error.message)
  } finally {
    isLoading.value = false
  }
}

// --- Modal 操作 ---
const openCreateModal = () => {
  isEditing.value = false
  Object.assign(form, initialForm)
  previewAvatar.value = ''
  selectedFile = null
  if(formRef.value) formRef.value.clearValidate()
  isModalOpen.value = true
}

const openEditModal = (member: any) => {
  if (!isAdmin.value) {
    // 若非管理員，仍可提供彈窗檢視詳情模式(唯讀)，但根據需求這裡直接return，或依照你的設計進行
    return
  }
  isEditing.value = true
  Object.assign(form, member)
  previewAvatar.value = member.avatar_url || ''
  selectedFile = null
  if(formRef.value) formRef.value.clearValidate()
  isModalOpen.value = true
}

// --- 圖片上傳邏輯 ---
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile = target.files[0]
    previewAvatar.value = URL.createObjectURL(selectedFile)
  }
}

const uploadAvatar = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
  const filePath = `avatars/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file)

  if (uploadError) throw new Error('圖片上傳失敗，請確認 Storage 是否已建立 avatars 儲存桶。')
  
  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return data.publicUrl
}

// --- 表單送出 ---
const submitForm = async () => {
  if (!formRef.value) return
  
  try {
    const valid = await formRef.value.validate()
    if (!valid) return
  } catch (err) {
    // validation failed
    return
  }
  
  isSubmitting.value = true
  try {
    // 1. 若有選擇新頭像，先上傳
    if (selectedFile) {
      form.avatar_url = await uploadAvatar(selectedFile)
    }

    // 2. 構建 payload (拔除不需要的空 ID，且過濾空字串為 null 以免日期欄位報錯)
    const payload: any = { ...form }
    if (!isEditing.value) delete payload.id // 新增不需要傳入 id
    
    for (const key in payload) {
      if (payload[key] === '') {
        payload[key] = null
      }
    }
    
    console.log("Submitting payload to team_members:", payload)

    // 3. 執行 UPSERT 或 INSERT
    if (isEditing.value) {
      const { error } = await supabase.from('team_members').update(payload).eq('id', form.id)
      if (error) throw error
      ElMessage.success('更新資料成功！')
    } else {
      const { error } = await supabase.from('team_members').insert(payload)
      if (error) throw error
      ElMessage.success('新增隊員成功！')
    }

    isModalOpen.value = false
    fetchData()
  } catch (error: any) {
    console.error("Submit Error:", error)
    ElMessage.error(error.message || '發生錯誤')
  } finally {
    isSubmitting.value = false
  }
}

// --- 刪除資料 ---
const confirmDelete = async () => {
  try {
    await ElMessageBox.confirm(`確定要刪除「${form.name}」的資料嗎？`, '⚠️ 刪除確認', {
      confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error'
    })
    
    isSubmitting.value = true
    const { error } = await supabase.from('team_members').delete().eq('id', form.id)
    if (error) throw error
    
    ElMessage.success('刪除成功')
    isModalOpen.value = false
    fetchData()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error('刪除失敗：' + err.message)
  } finally {
    isSubmitting.value = false
  }
}

// --- 介面輔助 ---
const getRoleClass = (role: string) => {
  switch (role) {
    case '球員': return 'border-primary text-primary bg-primary/10'
    case '教練': return 'border-secondary text-[#ca8a04] bg-secondary/10'
    case '管理群': return 'border-slate-800 text-slate-800 bg-slate-100'
    default: return 'border-gray-500 text-gray-500 bg-gray-50'
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style>
/* Light Theme Custom Tabs */
.light-tabs .el-tabs__item {
  font-size: 1rem;
  font-weight: 800;
  color: #64748b;
}
.light-tabs .el-tabs__item.is-active {
  color: var(--color-primary);
}
.light-tabs .el-tabs__active-bar {
  background-color: var(--color-primary);
  height: 3px;
}
.light-tabs .el-tabs__nav-wrap::after {
  height: 2px;
  background-color: #e2e8f0;
}

/* Modal Styling */
.custom-dialog.el-dialog {
  border-radius: 16px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
}
.custom-dialog .el-dialog__header {
  border-bottom: 2px solid var(--color-primary);
  margin-right: 0;
  padding: 24px;
}
.custom-dialog .el-dialog__title {
  color: #1e293b !important; 
  font-weight: 900;
  font-size: 1.25rem;
}
.custom-dialog .el-dialog__body {
  padding: 16px 24px 0px 24px;
}
.custom-dialog .el-form-item__label {
  color: #475569 !important;
}

/* Scrollbar */
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

/* 行動裝置滿版設定 (含 iOS 瀏海 / 安全區域調整) */
@media (max-width: 639px) {
  .custom-dialog {
    --el-dialog-width: 100% !important;
    --el-dialog-margin-top: 0 !important;
    margin: 0 !important;
    height: 100dvh;
    border-radius: 0 !important;
    display: flex;
    flex-direction: column;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .custom-dialog .el-dialog__header {
    padding-top: max(24px, env(safe-area-inset-top)) !important;
  }
  .custom-dialog .el-dialog__body {
    flex: 1;
    overflow-y: hidden;
    display: flex;
    flex-direction: column;
    padding: 16px !important;
  }
  .custom-dialog .el-form {
    max-height: none !important;
    flex: 1;
    overflow-y: auto;
  }
}
</style>
