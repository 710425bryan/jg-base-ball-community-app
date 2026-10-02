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
          <button @click="openCreateRoleModal" class="bg-primary hover:bg-primary-hover active:scale-95 text-white min-h-11 px-3 py-1.5 rounded-lg text-sm font-bold transition-all flex items-center gap-1 shrink-0">
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
                <span class="text-xs text-gray-500 mt-1">排序 {{ getRoleWeight(role) }}</span>
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
            <RoleSortEditor :role="selectedRole" :can-edit="permissionsStore.currentRole === 'ADMIN'" @saved="handleRoleWeightSaved" />
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
      append-to-body
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
            <button
              type="button"
              aria-label="關閉權限設定"
              title="關閉權限設定"
              @click="isDrawerOpen = false"
              class="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <!-- Drawer Body -->
        <div class="permissions-drawer__scroll flex-1 overflow-y-auto p-4" v-loading="isLoadingPermissions">
          <RoleSortEditor v-if="selectedRole" :role="selectedRole" :can-edit="permissionsStore.currentRole === 'ADMIN'" class="mb-4" @saved="handleRoleWeightSaved" />
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
      width="400px"
      :show-close="false"
      :close-on-click-modal="!isSubmitting"
      :close-on-press-escape="!isSubmitting"
      class="custom-dialog create-role-dialog"
    >
      <el-form :model="form" :rules="rules" :disabled="isSubmitting" ref="formRef" label-position="top" class="mt-2 space-y-4">
        <el-form-item label="角色識別碼 (英文/大寫)" prop="role_key" class="font-bold">
          <el-input v-model="form.role_key" placeholder="例如: ASST_COACH" size="large" @input="form.role_key = form.role_key.toUpperCase().replace(/[^A-Z_]/g, '')" />
          <p class="text-[12px] font-normal text-gray-400 mt-1">僅限大寫英文字母與底線，創建後不可更改。</p>
        </el-form-item>
        <el-form-item label="顯示名稱 (中文)" prop="role_name" class="font-bold">
          <el-input v-model="form.role_name" placeholder="例如: 助理教練" size="large" />
        </el-form-item>
        <el-form-item label="複製角色權限" prop="copy_from_role_key" class="font-bold">
          <el-select v-model="form.copy_from_role_key" :empty-values="[null, undefined]" size="large" class="w-full" aria-label="複製角色權限">
            <el-option label="不複製，從空白權限開始" value="" />
            <el-option
              v-for="role in roles"
              :key="role.role_key"
              :value="role.role_key"
              :label="role.role_key === 'ADMIN' ? `${role.role_name}（最高權限無法複製）` : `${role.role_name} (${role.role_key})`"
              :disabled="role.role_key === 'ADMIN'"
            />
          </el-select>
          <p class="text-[12px] font-normal text-gray-500 mt-1 leading-relaxed">複製所選角色目前的權限，新增後可再調整，不會影響來源角色。ADMIN 的特殊最高權限無法複製。</p>
        </el-form-item>
      </el-form>

      <template #footer>
        <AppDialogFooter
          confirm-label="確認新增"
          :loading="isSubmitting"
          :confirm-disabled="isSubmitting"
          @cancel="closeCreateRoleModal"
          @confirm="submitRole"
        />
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { createAppRole } from '@/services/rolesApi'
import { usePermissionsStore } from '@/stores/permissions'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import RoleSortEditor from '@/components/RoleSortEditor.vue'
import { getRoleWeight, sortUserRoles } from '@/utils/userRoleOrder'
import type { AppRole } from '@/types/appRole'

import { ACTIONS, systemFeatures } from '@/utils/permissionFeatures'

// ── 狀態 ────────────────────────────────────────────────────
const roles = ref<any[]>([])
const permissionsStore = usePermissionsStore()
const selectedRole = ref<any | null>(null)
// permissionFlags: { 'players:VIEW': true, 'players:CREATE': false, ... }
const permissionFlags = ref<Record<string, boolean>>({})
const isLoadingPermissions = ref(false)
const isDrawerOpen = ref(false)

const isModalOpen = ref(false)
const isSubmitting = ref(false)
const formRef = ref()

const form = reactive({ role_key: '', role_name: '', copy_from_role_key: '' })
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
    roles.value = sortUserRoles(data || [])
  }
}

const handleRoleWeightSaved = async (updated: AppRole) => {
  roles.value = sortUserRoles(roles.value.map(role => role.role_key === updated.role_key ? updated : role))
  permissionsStore.roles = [...roles.value]
  if (selectedRole.value?.role_key === updated.role_key) selectedRole.value = updated
  await fetchRoles()
  await permissionsStore.fetchRoles()
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
  if (isSubmitting.value) return
  form.role_key = ''
  form.role_name = ''
  form.copy_from_role_key = ''
  if (formRef.value) formRef.value.clearValidate()
  isModalOpen.value = true
}

const closeCreateRoleModal = () => {
  if (!isSubmitting.value) isModalOpen.value = false
}

const submitRole = async () => {
  if (!formRef.value || isSubmitting.value) return
  isSubmitting.value = true
  try {
    const valid = await formRef.value.validate().catch(() => false)
    if (!valid) return
    const created = await createAppRole({ ...form })
    ElMessage.success(form.copy_from_role_key ? '角色已建立，並複製來源角色權限！' : '建立成功！')
    isModalOpen.value = false
    await fetchRoles()
    await permissionsStore.fetchRoles()
    await selectRole(created)
  } catch (error: any) {
    ElMessage.error(error.code === '23505' ? '該識別碼已存在，請更換一個' : '建立角色失敗：' + (error.message || '請稍後再試'))
  } finally {
    isSubmitting.value = false
  }
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
.create-role-dialog {
  --el-color-primary: var(--color-primary);
  --el-color-primary-light-3: var(--color-primary-hover);
  --el-color-primary-dark-2: var(--color-primary-hover);
  border-radius: 16px;
}

@media (max-width: 767px) {
  .create-role-dialog :is(.el-input__wrapper, .el-select__wrapper) {
    min-height: 44px;
  }

  .create-role-dialog :is(.el-input__inner, .el-select__selected-item) {
    font-size: 16px;
  }
}

.permissions-drawer .el-drawer__body {
  padding: 0;
  overflow: hidden;
}

.permissions-drawer__scroll {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}
</style>
