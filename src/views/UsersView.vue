<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-0 md:pb-6">
    <!-- Header Section -->
    <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4 shrink-0">
      <div>
        <h2 class="text-3xl font-extrabold text-primary tracking-tight flex items-center gap-2">
          使用者名單
          <span class="text-sm font-medium bg-orange-50 text-primary px-3 py-1 rounded-full align-middle">
            {{ users.length }} 名成員
          </span>
        </h2>
        <p class="text-gray-500 font-medium text-sm mt-1">管理社區內的教練、經理與球員權限</p>
      </div>
      
      <button @click="openCreateModal" class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-5 py-2.5 rounded-xl shadow-[0_8px_20px_rgba(216,143,34,0.25)] text-sm font-bold transition-all flex items-center gap-2 min-w-max self-start md:self-auto">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
        新增使用者
      </button>
    </div>

    <!-- Tabs -->
    <el-tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0 bg-transparent custom-tabs">
      <el-tab-pane label="系統帳號管理" name="users" class="h-full flex flex-col">
        <!-- Data Table Card -->
        <div class="flex-1 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 overflow-hidden flex flex-col min-h-[600px] sm:min-h-0">
      <el-table 
        :data="users" 
        style="width: 100%; height: 100%" 
        height="100%"
        v-loading="isLoading" 
        empty-text="目前沒有使用者資料"
        class="custom-users-table"
      >
        <el-table-column label="使用者" min-width="250">
          <template #default="{ row }">
            <div class="flex items-center gap-4 py-2">
              <div class="relative w-12 h-12 rounded-full overflow-hidden shadow-sm border border-gray-100 bg-gray-50 shrink-0">
                <img v-if="row.avatar_url" :src="row.avatar_url" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center text-gray-300 font-bold bg-gradient-to-br from-gray-50 to-gray-200">
                  {{ row.name.charAt(0) }}
                </div>
              </div>
              <div class="flex flex-col">
                <span class="font-extrabold text-gray-800 text-base flex items-center gap-2">
                  {{ row.name }}
                  <span v-if="row.nickname" class="text-sm font-bold text-gray-400">({{ row.nickname }})</span>
                </span>
                <span class="text-gray-500 text-sm truncate font-medium mt-0.5">{{ row.email }}</span>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="role" label="權限角色" width="160">
          <template #default="{ row }">
            <span :class="getRoleTagClass(row.role)" class="px-3 py-1.5 rounded-lg text-sm font-bold border flex items-center w-max gap-1">
              <span class="w-1.5 h-1.5 rounded-full" :class="getRoleDotClass(row.role)"></span>
              {{ getRoleName(row.role) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="加入時間" width="160" class-name="hidden md:table-cell">
          <template #default="{ row }">
            <span class="text-gray-500 font-medium text-sm">{{ formatDate(row.created_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="140" align="right" fixed="right">
          <template #default="{ row }">
            <div class="flex gap-2 justify-end">
              <button @click="openEditModal(row)" class="p-2 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-xl transition-all" title="編輯">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              <button @click="confirmDelete(row)" class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="刪除">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
    </el-tab-pane>

    <el-tab-pane label="角色與權限設定" name="roles" class="h-full">
      <RolePermissionsManager />
    </el-tab-pane>
    </el-tabs>

    <!-- Modal Form (Create / Edit) -->
    <el-dialog
      v-model="isModalOpen"
      :title="isEditing ? '編輯使用者資料' : '新增使用者'"
      width="90%"
      style="max-width: 500px; border-radius: 16px;"
      :show-close="false"
      class="custom-dialog"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" class="mt-2 space-y-4">
        
        <!-- 大頭貼上傳區 -->
        <div class="flex flex-col items-center justify-center mb-6">
          <div class="relative w-24 h-24 rounded-full border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center overflow-hidden hover:bg-gray-100 transition-colors cursor-pointer" @click="triggerFileInput">
            <img v-if="form.avatar_url || avatarPreview" :src="avatarPreview || form.avatar_url" class="w-full h-full object-cover absolute inset-0 z-10" />
            <div class="z-0 flex flex-col items-center justify-center text-gray-400" :class="{ 'opacity-0': form.avatar_url || avatarPreview }">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mb-1 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              <span class="text-sm font-bold">上傳大頭貼</span>
            </div>
            <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handleFileSelect" />
          </div>
        </div>

        <el-form-item label="登入信箱 (Email)" prop="email" class="font-bold">
          <el-input v-model="form.email" placeholder="輸入常用 Email" :disabled="isEditing" size="large" />
          <p v-if="isEditing" class="text-sm text-gray-400 font-normal mt-1 w-full">信箱建立後不可直接修改，如需變更請由使用者本人自行更改。</p>
        </el-form-item>

        <el-form-item v-if="!isEditing" label="初始登入密碼" prop="password" class="font-bold">
          <el-input v-model="form.password" type="password" placeholder="請設定 6 碼以上的初始密碼" size="large" show-password />
        </el-form-item>

        <div class="flex gap-4 w-full flex-col sm:flex-row">
          <el-form-item label="真實姓名" prop="name" class="font-bold flex-1">
            <el-input v-model="form.name" placeholder="輸入姓名" size="large" />
          </el-form-item>
          <el-form-item label="綽號 / 稱呼" prop="nickname" class="font-bold flex-1">
            <el-input v-model="form.nickname" placeholder="(選填)" size="large" />
          </el-form-item>
        </div>

        <el-form-item label="角色權限" prop="role" class="font-bold">
          <el-select v-model="form.role" placeholder="請選擇職位角色" size="large" class="w-full">
            <el-option 
              v-for="r in permissionsStore.roles" 
              :key="r.role_key"
              :label="`${r.role_key} — ${r.role_name}`" 
              :value="r.role_key" 
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button @click="isModalOpen = false" class="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">取消</button>
          <button @click="submitForm" :disabled="isSubmitting" class="px-6 py-2.5 bg-gray-800 hover:bg-gray-900 active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-lg shadow-gray-200 transition-all flex items-center justify-center min-w-[100px]">
            <span v-if="isSubmitting" class="flex gap-2 items-center"><el-icon class="is-loading"><Loading /></el-icon> 儲存中</span>
            <span v-else>確認儲存</span>
          </button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { compressImage } from '@/utils/imageCompressor'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import RolePermissionsManager from '@/components/RolePermissionsManager.vue'
import { usePermissionsStore } from '@/stores/permissions'

const permissionsStore = usePermissionsStore()

const activeTab = ref('users')

// -- 資料狀態 --
const users = ref<any[]>([])
const isLoading = ref(true)

// -- 視窗與表單狀態 --
const isModalOpen = ref(false)
const isEditing = ref(false)
const isSubmitting = ref(false)
const formRef = ref()
const fileInput = ref<HTMLInputElement | null>(null)
const avatarFile = ref<File | null>(null)
const avatarPreview = ref<string | null>(null)

const form = reactive({
  id: '',
  email: '',
  password: '',
  name: '',
  nickname: '',
  role: 'COACH',
  avatar_url: ''
})

const rules = {
  email: [{ required: true, message: '請輸入電子信箱', trigger: 'blur' }, { type: 'email', message: '信箱格式不正確', trigger: ['blur', 'change'] }],
  password: [{ required: true, message: '請輸入密碼', trigger: 'blur' }, { min: 6, message: '密碼至少需 6 碼', trigger: 'blur' }],
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '請選擇權限', trigger: 'change' }]
}

// -- 工具函式 --
const getRoleName = (role: string) => {
  const r = permissionsStore.roles.find(x => x.role_key === role)
  return r ? r.role_name : role
}

const getRoleTagClass = (role: string) => {
  if (role === 'ADMIN') return 'bg-red-50 border-red-200 text-red-700'
  if (role === 'MANAGER') return 'bg-purple-50 border-purple-200 text-purple-700'
  if (role === 'HEAD_COACH') return 'bg-orange-50 border-orange-200 text-primary'
  return 'bg-blue-50 border-blue-200 text-blue-700'
}

const getRoleDotClass = (role: string) => {
  if (role === 'ADMIN') return 'bg-red-500'
  if (role === 'MANAGER') return 'bg-purple-500'
  if (role === 'HEAD_COACH') return 'bg-primary'
  return 'bg-blue-500'
}

const formatDate = (dateString: string) => {
  if (!dateString) return '-'
  const d = new Date(dateString)
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

// -- 讀取資料 --
const fetchUsers = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    users.value = data || []
  } catch (error: any) {
    ElMessage.error('無法載入名單：' + error.message)
  } finally {
    isLoading.value = false
  }
}

// -- 表單操作 --
const resetFormItems = () => {
  form.id = ''
  form.email = ''
  form.password = ''
  form.name = ''
  form.nickname = ''
  form.role = 'COACH'
  form.avatar_url = ''
  avatarFile.value = null
  avatarPreview.value = null
  if(formRef.value) formRef.value.clearValidate()
}

const openCreateModal = () => {
  resetFormItems()
  isEditing.value = false
  isModalOpen.value = true
}

const openEditModal = (row: any) => {
  resetFormItems()
  isEditing.value = true
  // 填充資料
  form.id = row.id
  form.email = row.email
  form.name = row.name
  form.nickname = row.nickname || ''
  form.role = row.role
  form.avatar_url = row.avatar_url || ''
  isModalOpen.value = true
}

// -- 大頭貼處理 --
const triggerFileInput = () => { fileInput.value?.click() }
const handleFileSelect = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  if (file.size > 5 * 1024 * 1024) {  // 5MB 限制
    return ElMessage.warning('圖片大小請勿超過 5MB')
  }
  
  avatarFile.value = file
  avatarPreview.value = URL.createObjectURL(file)
}

const uploadAvatar = async (userId: string) => {
  if (!avatarFile.value) return form.avatar_url

  const compressedFile = await compressImage(avatarFile.value, 800, 800)

  const fileExt = compressedFile.name.split('.').pop()
  const filePath = `user-${userId}-${Math.random().toString(36).substring(7)}.${fileExt}`

  const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, compressedFile)
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return data.publicUrl
}

// -- 提交儲存 --
const submitForm = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    isSubmitting.value = true
    
    try {
      if (isEditing.value) {
        // [UPDATE]
        const finalAvatarUrl = avatarFile.value ? await uploadAvatar(form.id) : form.avatar_url
        const { error } = await supabase.from('profiles').update({
          name: form.name,
          nickname: form.nickname,
          role: form.role,
          avatar_url: finalAvatarUrl,
          updated_at: new Date().toISOString()
        }).eq('id', form.id)

        if (error) throw error
        ElMessage.success('更新成功！')
      } else {
        // [CREATE] 放棄容易報錯的 RPC，改採最安全正統的官方 API：另開無紀錄的隱私 Client
        // 這樣不但能漂亮地透過 GoTrue 寫入最正確格式的帳號，也不會把畫面上的管理員自己給登出！
        const tempClient = supabase // 此處必須實作一個不會紀錄 session 的實體
        const authData = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/signup`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ email: form.email, password: form.password })
          }
        ).then(res => res.json())
        
        // Supabase Auth HTTP Error Handling
        if (authData?.msg || authData?.code) {
           throw new Error(authData?.msg || authData?.message || '建立 auth.users 失敗')
        }

        const newUserId = authData?.user?.id || authData?.id
        if (!newUserId) throw new Error('API 並未正確回傳用戶 ID')

        // 新增 Profile
        const finalAvatarUrl = avatarFile.value ? await uploadAvatar(newUserId) : form.avatar_url
        
        // 為了避免 Insert Policy 擋下（特別是當前管理員自身權限不完美時），我們改呼叫 RPC 來安全插入 profiles
        const { error: profileError } = await supabase.rpc('admin_insert_profile', {
          target_id: newUserId,
          p_email: form.email,
          p_name: form.name,
          p_nickname: form.nickname,
          p_role: form.role,
          p_avatar: finalAvatarUrl
        })
        
        if (profileError) {
          console.error("Profile Error: ", profileError)
          ElMessage.warning('帳號創建成功，但基本資料寫入受阻（可能是資料庫 INSERT 權限不足，可呼叫管理員開放）')
        } else {
          ElMessage.success('新增使用者成功！該成員已能透過信箱登入。')
        }
      }

      isModalOpen.value = false
      await fetchUsers()
      
    } catch (error: any) {
      console.error(error)
      ElMessage.error(error.message || '操作失敗，請檢查權限或連線狀態')
    } finally {
      isSubmitting.value = false
    }
  })
}

// -- 刪除提示 --
const confirmDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${row.name}」嗎？這將會同步移除登入權限與所有基本資料，此操作無法復原！`, 
      '⚠️ 刪除確認', 
      { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error', buttonSize: 'large' }
    )
    
    const { error } = await supabase.rpc('admin_delete_user', { target_user_id: row.id })
    if (error) throw error
    
    ElMessage.success('已成功移除該使用者與身分權限。')
    fetchUsers()

  } catch (error: any) {
    if (error !== 'cancel') {
      console.error(error)
      ElMessage.error('刪除失敗：' + (error.message || '請確認您是否有執行刪除函數的權限'))
    }
  }
}

onMounted(async () => {
  if (permissionsStore.roles.length === 0) {
    await permissionsStore.fetchRoles()
  }
  fetchUsers()
})
</script>

<style>
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

/* 滿版 Tab 修飾 */
.custom-tabs .el-tabs__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}
.custom-tabs .el-tabs__item {
  font-weight: 800;
  font-size: 1rem;
}
</style>
