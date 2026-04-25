<template>
  <div class="h-full flex flex-col relative animate-fade-in pb-2 md:pb-6">

    <!-- 桌面版：左右並排 | 手機版：只顯示角色列表 -->
    <div class="flex-1 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-0 min-h-0">
      
      <!-- Role List Sidebar -->
      <div class="w-full lg:w-64 xl:w-72 border-b lg:border-b-0 lg:border-r border-gray-100 flex flex-col bg-gray-50/30 lg:min-h-0 lg:shrink-0">
        <div class="p-4 border-b border-gray-100 bg-white shrink-0 flex justify-between items-center gap-3">
          <div>
            <span class="font-bold text-gray-700">自定義角色</span>
            <span class="text-xs text-gray-400 font-medium lg:hidden block mt-0.5">點選角色設定權限</span>
          </div>
          <button @click="openCreateRoleModal" class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
            新增角色
          </button>
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
              <div class="flex items-center gap-2">
                <!-- 手機版：箭頭提示 -->
                <span class="lg:hidden text-gray-300">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                </span>
                <div class="flex gap-1" v-if="selectedRole?.role_key === role.role_key">
                  <button v-if="!role.is_system" @click.stop="confirmDeleteRole(role)" class="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white transition-colors" title="刪除角色">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 桌面版：右側權限矩陣 (lg 以上才顯示) -->
      <div class="hidden lg:flex flex-1 flex-col min-w-0">
        <template v-if="selectedRole">
          <div class="p-5 border-b border-gray-100 flex justify-between items-end flex-wrap gap-4 shrink-0 bg-white">
            <div>
              <h3 class="text-xl font-extrabold text-gray-800">
                {{ selectedRole.role_name }}
                <span class="text-sm font-bold text-gray-400 ml-2">權限配置</span>
              </h3>
              <p class="text-sm text-gray-500 mt-1 font-medium">
                配置各功能模組的細粒度存取權限，變更後立即生效。
              </p>
            </div>
            <div v-if="selectedRole.is_system" class="px-3 py-1 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold border border-gray-200">
              系統預設 (無法刪除)
            </div>
          </div>
          
          <div class="flex-1 overflow-y-auto p-5 bg-white" v-loading="isLoadingPermissions">
            <!-- ADMIN 說明 -->
            <div v-if="selectedRole.role_key === 'ADMIN'" class="p-4 bg-orange-50 text-orange-700 text-sm font-bold text-center border border-orange-200 rounded-xl mb-4 flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              ADMIN 為系統最高權限，自動擁有所有功能的完整操作權，無法單獨調整。
            </div>

            <!-- 權限矩陣表格 -->
            <div class="overflow-x-auto rounded-xl border border-gray-100">
              <table class="w-full text-left">
                <thead class="bg-gray-50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th class="px-5 py-3 border-b border-gray-100 w-1/3">功能模組</th>
                    <th v-for="act in ACTIONS" :key="act.key" class="px-3 py-3 border-b border-gray-100 text-center w-20" :class="act.headerClass">
                      <div class="flex flex-col items-center gap-0.5">
                        <span :class="act.dotClass" class="w-2 h-2 rounded-full"></span>
                        {{ act.label }}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-50">
                  <tr v-for="feature in systemFeatures" :key="feature.key" class="hover:bg-gray-50/60 transition-colors group">
                    <td class="px-5 py-4">
                      <div class="font-bold text-gray-800 text-sm">{{ feature.name }}</div>
                      <div class="text-xs text-gray-400 mt-0.5 font-medium">{{ feature.desc }}</div>
                      <div class="text-[10px] font-mono text-gray-300 mt-0.5">{{ feature.key }}</div>
                    </td>
                    <td v-for="act in ACTIONS" :key="act.key" class="px-3 py-4 text-center">
                      <template v-if="feature.actions.includes(act.key)">
                        <button
                          @click="togglePermission(feature.key, act.key)"
                          :disabled="selectedRole.role_key === 'ADMIN'"
                          :class="[
                            'w-8 h-8 rounded-lg border-2 transition-all mx-auto flex items-center justify-center',
                            getFlag(feature.key, act.key)
                              ? act.checkedClass
                              : 'border-gray-200 bg-white hover:border-gray-300',
                            selectedRole.role_key === 'ADMIN' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer active:scale-95'
                          ]"
                        >
                          <svg v-if="getFlag(feature.key, act.key) || selectedRole.role_key === 'ADMIN'" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                          </svg>
                        </button>
                      </template>
                      <template v-else>
                        <span class="text-gray-200 text-lg">—</span>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- 圖例說明 -->
            <div class="flex flex-wrap items-center gap-4 mt-4 px-1">
              <span class="text-xs text-gray-400 font-bold">圖例：</span>
              <div v-for="act in ACTIONS" :key="act.key" class="flex items-center gap-1.5 text-xs font-bold" :class="act.legendClass">
                <span :class="act.dotClass" class="w-2 h-2 rounded-full"></span>
                {{ act.label }} — {{ act.desc }}
              </div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center bg-gray-50/30">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            <h3 class="text-lg font-bold text-gray-600">請從左側選擇角色</h3>
            <p class="text-sm mt-1">選取角色後即可配置其各功能模組的細粒度操作權限。</p>
          </div>
        </template>
      </div>
    </div>

    <!-- 手機版：底部 Drawer 顯示權限設定 (lg 以下才顯示) -->
    <el-drawer
      v-model="isDrawerOpen"
      direction="btt"
      size="88%"
      :show-close="false"
      class="permissions-drawer lg:hidden"
      :with-header="false"
    >
      <div class="h-full flex flex-col">
        <!-- Drawer Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 class="text-lg font-extrabold text-gray-800">
              {{ selectedRole?.role_name }}
              <span class="text-sm font-bold text-gray-400 ml-2">權限配置</span>
            </h3>
            <p class="text-xs text-gray-400 mt-0.5">變更後立即生效</p>
          </div>
          <div class="flex items-center gap-2">
            <div v-if="selectedRole?.is_system" class="px-2 py-1 bg-gray-100 text-gray-500 rounded-lg text-xs font-bold border border-gray-200">
              系統預設
            </div>
            <button @click="isDrawerOpen = false" class="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <!-- Drawer Body -->
        <div class="flex-1 overflow-y-auto p-4" v-loading="isLoadingPermissions">
          <div v-if="selectedRole?.role_key === 'ADMIN'" class="p-3 bg-orange-50 text-orange-700 text-xs font-bold text-center border border-orange-200 rounded-xl mb-4">
            ADMIN 為最高權限，自動擁有所有操作權，無法單獨調整。
          </div>

          <!-- 手機版：每個功能模組一張卡片，含 4 個 action badge -->
          <div class="space-y-3">
            <div 
              v-for="feature in systemFeatures" 
              :key="feature.key"
              class="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm"
            >
              <!-- 功能標題 -->
              <div class="px-4 py-3 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <div class="font-bold text-gray-800 text-sm">{{ feature.name }}</div>
                  <div class="text-xs text-gray-400 mt-0.5">{{ feature.desc }}</div>
                </div>
              </div>
              <!-- Action 按鈕列 -->
              <div class="px-4 py-3 flex flex-wrap gap-2">
                <template v-for="act in ACTIONS" :key="act.key">
                  <button
                    v-if="feature.actions.includes(act.key)"
                    @click="togglePermission(feature.key, act.key)"
                    :disabled="selectedRole?.role_key === 'ADMIN'"
                    :class="[
                      'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all flex items-center gap-1.5',
                      (getFlag(feature.key, act.key) || selectedRole?.role_key === 'ADMIN')
                        ? act.checkedMobileClass
                        : 'border-gray-200 bg-white text-gray-400',
                      selectedRole?.role_key === 'ADMIN' ? 'cursor-not-allowed' : 'active:scale-95'
                    ]"
                  >
                    <svg v-if="getFlag(feature.key, act.key) || selectedRole?.role_key === 'ADMIN'" xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                    {{ act.label }}
                  </button>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>

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

// ── 常數定義 ────────────────────────────────────────────────
const ACTIONS = [
  {
    key: 'VIEW',
    label: '檢視',
    desc: '可瀏覽頁面與資料列表',
    headerClass: 'text-blue-500',
    dotClass: 'bg-blue-400',
    legendClass: 'text-blue-500',
    checkedClass: 'border-blue-400 bg-blue-50 text-blue-600',
    checkedMobileClass: 'border-blue-400 bg-blue-50 text-blue-600'
  },
  {
    key: 'CREATE',
    label: '新增',
    desc: '可建立新資料',
    headerClass: 'text-emerald-500',
    dotClass: 'bg-emerald-400',
    legendClass: 'text-emerald-600',
    checkedClass: 'border-emerald-400 bg-emerald-50 text-emerald-600',
    checkedMobileClass: 'border-emerald-400 bg-emerald-50 text-emerald-600'
  },
  {
    key: 'EDIT',
    label: '修改',
    desc: '可編輯或審核資料',
    headerClass: 'text-amber-600',
    dotClass: 'bg-amber-400',
    legendClass: 'text-amber-600',
    checkedClass: 'border-amber-400 bg-amber-50 text-amber-600',
    checkedMobileClass: 'border-amber-400 bg-amber-50 text-amber-600'
  },
  {
    key: 'DELETE',
    label: '刪除',
    desc: '可刪除或作廢資料',
    headerClass: 'text-red-500',
    dotClass: 'bg-red-400',
    legendClass: 'text-red-500',
    checkedClass: 'border-red-400 bg-red-50 text-red-600',
    checkedMobileClass: 'border-red-400 bg-red-50 text-red-600'
  }
]

const systemFeatures = [
  {
    key: 'leave_requests',
    name: '請假系統',
    desc: '新增、檢核請假單',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'players',
    name: '球員名單',
    desc: '檢視、編輯所有球員基本資料',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'users',
    name: '人員與權限設定',
    desc: '管理使用者登入帳號、指定角色與權限',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'join_inquiries',
    name: '入隊申請',
    desc: '表單申請查閱、審核與回覆管理',
    actions: ['VIEW', 'EDIT', 'DELETE']
  },
  {
    key: 'announcements',
    name: '系統公告',
    desc: '發布首頁跑馬燈與系統公告',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'attendance',
    name: '點名系統',
    desc: '建立活動並進行出缺席點名',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'matches',
    name: '比賽紀錄',
    desc: '新增編輯賽事成績、先發名單',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'fees',
    name: '收費管理',
    desc: '月費計算、季費/儲值管理',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  },
  {
    key: 'equipment',
    name: '裝備管理',
    desc: '管理裝備庫存、加購申請與付款審核',
    actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
  }
]

// ── 狀態 ────────────────────────────────────────────────────
const roles = ref<any[]>([])
const selectedRole = ref<any | null>(null)
// permissionFlags: { 'players:VIEW': true, 'players:CREATE': false, ... }
const permissionFlags = ref<Record<string, boolean>>({})
const isLoadingPermissions = ref(false)
const isDrawerOpen = ref(false)

const isModalOpen = ref(false)
const isSubmitting = ref(false)
const formRef = ref()

const form = reactive({ role_key: '', role_name: '' })
const rules = {
  role_key: [{ required: true, message: '請輸入角色識別碼', trigger: 'blur' }],
  role_name: [{ required: true, message: '請輸入顯示名稱', trigger: 'blur' }]
}

// ── 工具函式 ──────────────────────────────────────────────
const flagKey = (feature: string, action: string) => `${feature}:${action}`

const getFlag = (feature: string, action: string): boolean => {
  return !!permissionFlags.value[flagKey(feature, action)]
}

// ── 資料取得 ──────────────────────────────────────────────
const fetchRoles = async () => {
  const { data, error } = await supabase.from('app_roles').select('*').order('weight', { ascending: true })
  if (error) {
    ElMessage.error('無法載入角色名單')
  } else {
    roles.value = data || []
  }
}

const loadPermissions = async (role: any) => {
  isLoadingPermissions.value = true
  permissionFlags.value = {}

  if (role.role_key === 'ADMIN') {
    // ADMIN 全部顯示為已勾選
    systemFeatures.forEach(f => {
      f.actions.forEach(a => {
        permissionFlags.value[flagKey(f.key, a)] = true
      })
    })
    isLoadingPermissions.value = false
    return
  }

  const { data, error } = await supabase
    .from('app_role_permissions')
    .select('feature, action')
    .eq('role_key', role.role_key)

  isLoadingPermissions.value = false

  if (!error && data) {
    data.forEach((row: any) => {
      permissionFlags.value[flagKey(row.feature, row.action)] = true
    })
  }
}

const selectRole = async (role: any) => {
  selectedRole.value = role
  await loadPermissions(role)

  // 手機版：開啟 Drawer
  if (window.innerWidth < 1024) {
    isDrawerOpen.value = true
  }
}

// ── 切換權限 ──────────────────────────────────────────────
const togglePermission = async (featureKey: string, action: string) => {
  if (!selectedRole.value || selectedRole.value.role_key === 'ADMIN') return

  const rkey = selectedRole.value.role_key
  const fk = flagKey(featureKey, action)
  const current = !!permissionFlags.value[fk]
  const newValue = !current

  // 樂觀更新 UI
  permissionFlags.value[fk] = newValue

  // 若開啟 CREATE/EDIT/DELETE，自動連帶開啟 VIEW
  if (newValue && action !== 'VIEW') {
    const viewFk = flagKey(featureKey, 'VIEW')
    if (!permissionFlags.value[viewFk]) {
      permissionFlags.value[viewFk] = true
      // 同步寫入 VIEW 到 DB
      await supabase.from('app_role_permissions').upsert(
        { role_key: rkey, feature: featureKey, action: 'VIEW' },
        { onConflict: 'role_key,feature,action' }
      )
    }
  }

  if (newValue) {
    const { error } = await supabase.from('app_role_permissions').upsert(
      { role_key: rkey, feature: featureKey, action },
      { onConflict: 'role_key,feature,action' }
    )
    if (error) {
      ElMessage.error('儲存失敗')
      permissionFlags.value[fk] = false
    }
  } else {
    // 若關閉 VIEW，同步關閉所有其他 action
    if (action === 'VIEW') {
      const feature = systemFeatures.find(f => f.key === featureKey)
      if (feature) {
        for (const a of feature.actions) {
          if (a !== 'VIEW') permissionFlags.value[flagKey(featureKey, a)] = false
        }
        await supabase.from('app_role_permissions').delete()
          .eq('role_key', rkey).eq('feature', featureKey)
        return
      }
    }

    const { error } = await supabase.from('app_role_permissions').delete()
      .eq('role_key', rkey).eq('feature', featureKey).eq('action', action)
    if (error) {
      ElMessage.error('移除失敗')
      permissionFlags.value[fk] = true
    }
  }
}

// ── 角色新增 ──────────────────────────────────────────────
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
      ElMessage.error(error.code === '23505' ? '該識別碼已存在，請更換一個' : '建立角色失敗：' + error.message)
    } else {
      ElMessage.success('建立成功！')
      isModalOpen.value = false
      await fetchRoles()
      const created = roles.value.find(r => r.role_key === form.role_key)
      if (created) selectRole(created)
    }
  })
}

// ── 角色刪除 ──────────────────────────────────────────────
const confirmDeleteRole = async (role: any) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${role.role_name}」角色嗎？請確認目前沒有正在使用此角色的帳號。`,
      '⚠️ 刪除確認',
      { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error' }
    )

    const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', role.role_key)
    if (count && count > 0) {
      ElMessage.warning(`尚有 ${count} 名帳號正在使用此角色，無法刪除`)
      return
    }

    await supabase.from('app_role_permissions').delete().eq('role_key', role.role_key)
    const { error } = await supabase.from('app_roles').delete().eq('role_key', role.role_key)

    if (error) throw error
    ElMessage.success('已刪除！')

    if (selectedRole.value?.role_key === role.role_key) {
      selectedRole.value = null
      isDrawerOpen.value = false
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

<style>
.permissions-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}
</style>
