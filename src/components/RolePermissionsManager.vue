<template>
  <div class="h-full flex flex-col relative animate-fade-in pb-2 md:pb-6">
    <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4 shrink-0">
      <div>
        <h2 class="text-3xl font-extrabold text-primary tracking-tight flex items-center gap-2">
          角色與權限設定
        </h2>
        <p class="text-gray-500 font-medium text-sm mt-1">自定義各職位的系統存取權限與操作範圍</p>
      </div>
      <button @click="openCreateRoleModal" class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-5 py-2.5 rounded-xl shadow-[0_8px_20px_rgba(216,143,34,0.25)] text-sm font-bold transition-all flex items-center gap-2 min-w-max self-start md:self-auto">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
        新增角色
      </button>
    </div>

    <div class="flex-1 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 overflow-hidden flex flex-col lg:flex-row gap-0">
      
      <!-- Role List Sidebar -->
      <div class="w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-gray-100 flex flex-col bg-gray-50/30">
        <div class="p-4 border-b border-gray-100 bg-white shrink-0 flex justify-between items-center">
          <span class="font-bold text-gray-700">自定義角色</span>
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          <div 
            v-for="role in roles" 
            :key="role.role_key"
            @click="selectRole(role)"
            :class="['p-4 rounded-xl mb-2 cursor-pointer transition-all border border-transparent', selectedRole?.role_key === role.role_key ? 'bg-orange-50 border-orange-200 shadow-sm' : 'hover:bg-white hover:border-gray-200']"
          >
            <div class="flex justify-between items-center">
              <div class="flex flex-col">
                <span class="font-extrabold text-gray-800" :class="{ 'text-primary': selectedRole?.role_key === role.role_key }">{{ role.role_name }}</span>
                <span class="text-xs font-bold text-gray-400 mt-0.5">{{ role.role_key }}</span>
              </div>
              <div class="flex gap-1" v-if="selectedRole?.role_key === role.role_key">
                <button v-if="!role.is_system" @click.stop="confirmDeleteRole(role)" class="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white transition-colors" title="刪除角色">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Permission Matrix Content -->
      <div class="flex-1 flex flex-col">
        <template v-if="selectedRole">
          <div class="p-4 sm:p-6 border-b border-gray-100 flex justify-between items-end flex-wrap gap-4 shrink-0 bg-white">
            <div>
              <h3 class="text-xl font-extrabold text-gray-800">{{ selectedRole.role_name }} <span class="text-sm font-bold text-gray-400 ml-2">權限配置</span></h3>
              <p class="text-sm text-gray-500 mt-1 font-medium">配置該角色於系統各模組的存取級別，變更完成後將自動儲存。</p>
            </div>
            <div v-if="selectedRole.is_system" class="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold border border-gray-200">
              系統預設 (無法刪除)
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-4 sm:p-6 bg-white" v-loading="isLoadingPermissions">
            <div class="overflow-x-auto rounded-xl border border-gray-100">
              <table class="w-full text-left min-w-[500px]">
                <thead class="bg-gray-50 text-gray-500 font-bold text-sm">
                  <tr>
                    <th class="px-4 text-center w-16 py-3 border-b border-gray-100">啟用</th>
                    <th class="px-4 py-3 border-b border-gray-100">功能模組</th>
                    <th class="px-4 py-3 border-b border-gray-100">英文識別 (Feature Key)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  <tr v-for="feature in systemFeatures" :key="feature.key" class="hover:bg-gray-50/50 transition-colors">
                    <td class="px-4 py-3 text-center">
                      <el-switch 
                        v-model="permissionFlags[feature.key]" 
                        @change="togglePermission(feature.key, $event)" 
                        style="--el-switch-on-color: #D88F22"
                        :disabled="selectedRole.role_key === 'ADMIN'"
                      />
                    </td>
                    <td class="px-4 py-3">
                      <div class="font-bold text-gray-800">{{ feature.name }}</div>
                      <div class="text-xs text-gray-500 mt-0.5">{{ feature.desc }}</div>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-400 font-mono">{{ feature.key }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="selectedRole.role_key === 'ADMIN'" class="p-4 bg-orange-50/50 text-orange-600 text-sm font-bold text-center border-t border-orange-100">
                ADMIN 角色為系統最高權限，固定擁有所有模組存取權，無法單獨關閉。
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center bg-gray-50/30">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            <h3 class="text-lg font-bold text-gray-600">請從左側選擇角色</h3>
            <p class="text-sm mt-1">選取角色後即可配置其專屬的模組開關。</p>
          </div>
        </template>
      </div>

    </div>

    <!-- Create Role Modal -->
    <el-dialog
      v-model="isModalOpen"
      title="新增客製化角色"
      width="90%"
      style="max-width: 400px; border-radius: 16px;"
      :show-close="false"
      class="custom-dialog"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" class="mt-2 space-y-4">
        
        <el-form-item label="角色識別碼 (英文/大寫)" prop="role_key" class="font-bold">
          <el-input v-model="form.role_key" placeholder="例如: ASST_COACH" size="large" @input="form.role_key = form.role_key.toUpperCase().replace(/[^A-Z_]/g, '')" />
          <p class="text-[12px] font-normal text-gray-400 mt-1">僅限大寫英文字母與底線，創建後不可更改。</p>
        </el-form-item>

        <el-form-item label="顯示名稱 (中文)" prop="role_name" class="font-bold">
          <el-input v-model="form.role_name" placeholder="例如: 助理教練" size="large" />
        </el-form-item>

      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button @click="isModalOpen = false" class="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">取消</button>
          <button @click="submitRole" :disabled="isSubmitting" class="px-6 py-2.5 bg-gray-800 hover:bg-gray-900 active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-lg shadow-gray-200 transition-all flex items-center justify-center">
            <span v-if="isSubmitting" class="flex gap-2 items-center"><el-icon class="is-loading"><Loading /></el-icon> 儲存中</span>
            <span v-else>確認新增</span>
          </button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'

const roles = ref<any[]>([])
const selectedRole = ref<any | null>(null)
const permissionFlags = ref<Record<string, boolean>>({})
const isLoadingPermissions = ref(false)

const isModalOpen = ref(false)
const isSubmitting = ref(false)
const formRef = ref()

const form = reactive({
  role_key: '',
  role_name: ''
})

const rules = {
  role_key: [{ required: true, message: '請輸入角色識別碼', trigger: 'blur' }],
  role_name: [{ required: true, message: '請輸入顯示名稱', trigger: 'blur' }]
}

const systemFeatures = [
  { key: 'leave_requests', name: '請假系統', desc: '新增、檢核請假單' },
  { key: 'players', name: '球員名單', desc: '檢視、編輯所有球員基本資料' },
  { key: 'users', name: '人員與權限設定', desc: '管理使用者登入帳號、指定角色與權限' },
  { key: 'join_inquiries', name: '入隊申請', desc: '表單申請查閱、回覆管理' },
  { key: 'announcements', name: '系統公告', desc: '發布首頁跑馬燈與公告' },
  { key: 'attendance', name: '點名系統', desc: '建立活動並進行出缺席點名' },
  { key: 'matches', name: '比賽紀錄', desc: '新增編輯賽事成績、先發名單' },
  { key: 'fees', name: '收費管理', desc: '月費計算、季費/儲值管理' }
]

const fetchRoles = async () => {
  const { data, error } = await supabase.from('app_roles').select('*').order('weight', { ascending: true })
  if (error) {
    ElMessage.error('無法載入角色名單')
  } else {
    roles.value = data || []
  }
}

const selectRole = async (role: any) => {
  selectedRole.value = role
  isLoadingPermissions.value = true
  permissionFlags.value = {}
  
  if (role.role_key === 'ADMIN') {
    systemFeatures.forEach(f => permissionFlags.value[f.key] = true)
    isLoadingPermissions.value = false
    return
  }

  const { data, error } = await supabase.from('app_role_permissions').select('feature').eq('role_key', role.role_key)
  isLoadingPermissions.value = false
  
  if (!error && data) {
    const existingFeatures = data.map((d: any) => d.feature)
    systemFeatures.forEach(f => {
      permissionFlags.value[f.key] = existingFeatures.includes(f.key)
    })
  }
}

const togglePermission = async (featureKey: string, newValue: string | number | boolean) => {
  if (!selectedRole.value) return
  const rkey = selectedRole.value.role_key

  if (newValue) {
    // Add permission
    const { error } = await supabase.from('app_role_permissions').insert({
      role_key: rkey,
      feature: featureKey,
      action: 'VIEW'
    })
    if (error) {
      ElMessage.error('儲存權限失敗')
      permissionFlags.value[featureKey] = false
    } else {
      ElMessage.success('已啟用該權限')
    }
  } else {
    // Remove permission
    const { error } = await supabase.from('app_role_permissions').delete()
      .eq('role_key', rkey).eq('feature', featureKey)
    if (error) {
      ElMessage.error('移除權限失敗')
      permissionFlags.value[featureKey] = true
    } else {
      ElMessage.info('已關閉該權限')
    }
  }
}

const openCreateRoleModal = () => {
  form.role_key = ''
  form.role_name = ''
  if (formRef.value) formRef.value.clearValidate()
  isModalOpen.value = true
}

const submitRole = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    isSubmitting.value = true
    
    const { error } = await supabase.from('app_roles').insert([
      { role_key: form.role_key, role_name: form.role_name, is_system: false }
    ])

    isSubmitting.value = false

    if (error) {
      if (error.code === '23505') {
        ElMessage.error('該識別碼已存在，請更換一個')
      } else {
        ElMessage.error('建立角色失敗：' + error.message)
      }
    } else {
      ElMessage.success('建立成功！')
      isModalOpen.value = false
      await fetchRoles()
      selectRole(roles.value.find(r => r.role_key === form.role_key))
    }
  })
}

const confirmDeleteRole = async (role: any) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${role.role_name}」角色嗎？請確認目前沒有正在使用此角色的帳號。`, 
      '⚠️ 刪除確認', 
      { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error' }
    )
    
    // Check if anyone uses it
    const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', role.role_key)
    if (count && count > 0) {
      ElMessage.warning(`尚有 ${count} 名帳號正在使用此角色，無法刪除`)
      return
    }

    // Since we have foreign key from app_role_permissions to app_roles with CASCADE typically, 
    // but just to be safe let's delete permissions manually first.
    await supabase.from('app_role_permissions').delete().eq('role_key', role.role_key)
    const { error } = await supabase.from('app_roles').delete().eq('role_key', role.role_key)
    
    if (error) throw error
    ElMessage.success('已刪除！')
    
    if (selectedRole.value?.role_key === role.role_key) {
      selectedRole.value = null
    }
    fetchRoles()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('刪除失敗：' + (err.message || err))
    }
  }
}

onMounted(() => {
  fetchRoles()
})
</script>
