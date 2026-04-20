<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0">
      <div class="max-w-5xl mx-auto">
        <h2 class="text-xl md:text-2xl font-black text-slate-800 leading-tight">個人設定</h2>
        <p class="text-xs md:text-sm font-bold text-gray-500 mt-1">
          更新大頭照、綽號與常用匯款資訊
        </p>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <div v-if="isLoading" class="min-h-[50vh] flex items-center justify-center">
        <div class="flex items-center gap-3 text-gray-500 font-bold">
          <el-icon class="is-loading text-primary text-2xl"><Loading /></el-icon>
          讀取個人設定中...
        </div>
      </div>

      <div v-else class="max-w-5xl mx-auto grid gap-4 lg:grid-cols-[320px,1fr]">
        <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6">
          <div class="flex flex-col items-center text-center">
            <div
              class="relative w-32 h-32 rounded-full border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden cursor-pointer group"
              @click="triggerFileInput"
            >
              <img
                v-if="avatarDisplayUrl"
                :src="avatarDisplayUrl"
                class="w-full h-full object-cover"
                alt="大頭照預覽"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-4xl font-black text-gray-300 bg-gradient-to-br from-gray-50 to-gray-100"
              >
                {{ currentDisplayName.charAt(0) || 'U' }}
              </div>

              <div class="absolute inset-0 bg-black/35 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span class="text-sm font-black">更換大頭照</span>
                <span class="text-[11px] font-medium mt-1">自動壓縮至 1MB 內</span>
              </div>
            </div>

            <input
              ref="fileInput"
              type="file"
              class="hidden"
              accept="image/*"
              @change="handleAvatarSelect"
            />

            <h3 class="mt-4 text-xl font-black text-slate-800">{{ currentDisplayName }}</h3>
            <p class="mt-1 text-sm font-bold text-primary">{{ currentRoleName }}</p>
            <p class="mt-2 text-xs text-gray-400 break-all">{{ authStore.profile?.email || authStore.user?.email || '未提供信箱' }}</p>

            <div class="w-full mt-5 space-y-3">
              <button
                type="button"
                class="w-full rounded-2xl bg-gray-900 hover:bg-black text-white font-bold py-3 transition-colors disabled:opacity-70"
                :disabled="isCompressing"
                @click="triggerFileInput"
              >
                {{ isCompressing ? '圖片處理中...' : '上傳新大頭照' }}
              </button>

              <button
                v-if="avatarDisplayUrl"
                type="button"
                class="w-full rounded-2xl border border-gray-200 text-gray-600 hover:text-red-500 hover:border-red-200 hover:bg-red-50 font-bold py-3 transition-colors"
                @click="clearAvatar"
              >
                移除目前大頭照
              </button>
            </div>

            <p class="mt-4 text-xs text-gray-400 leading-relaxed">
              支援手機拍照或相簿圖片，系統會在上傳前自動縮圖並嘗試壓縮到 1MB 內。
            </p>
          </div>
        </section>

        <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6">
          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-position="top"
            class="space-y-6"
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
                <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">真實姓名</div>
                <div class="mt-2 text-base font-black text-slate-800">{{ authStore.profile?.name || '未設定' }}</div>
              </div>

              <div class="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
                <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">登入角色</div>
                <div class="mt-2 text-base font-black text-slate-800">{{ currentRoleName }}</div>
              </div>
            </div>

            <el-form-item label="綽號 / 稱呼" prop="nickname" class="font-bold">
              <el-input
                v-model="form.nickname"
                size="large"
                maxlength="20"
                placeholder="例如：阿志、Bryan、教練"
                clearable
              />
              <p class="text-xs text-gray-400 mt-1">首頁與右上角會優先顯示綽號，沒填則維持真實姓名。</p>
            </el-form-item>

            <div class="grid gap-4 sm:grid-cols-2">
              <el-form-item label="常用匯款方式" prop="preferred_payment_method" class="font-bold">
                <el-select
                  v-model="form.preferred_payment_method"
                  size="large"
                  class="w-full"
                  clearable
                  placeholder="請選擇常用匯款方式"
                  @change="handlePaymentMethodChange"
                >
                  <el-option
                    v-for="option in paymentMethodOptions"
                    :key="option"
                    :label="option"
                    :value="option"
                  />
                </el-select>
                <p class="text-xs text-gray-400 mt-1">先提供常用選項，之後繳費回報可沿用同一套習慣。</p>
              </el-form-item>

              <el-form-item label="匯款帳號後五碼" prop="preferred_account_last_5" class="font-bold">
                <el-input
                  :model-value="form.preferred_account_last_5"
                  size="large"
                  maxlength="5"
                  placeholder="請輸入後五碼"
                  :disabled="!requiresAccountLast5"
                  @input="handleAccountLast5Input"
                />
                <p class="text-xs text-gray-400 mt-1">
                  {{ requiresAccountLast5 ? '請輸入 5 位數字；若是無摺存款也可填固定辨識碼。' : '選擇現金或尚未選擇匯款方式時，可先留空。' }}
                </p>
              </el-form-item>
            </div>

            <div
              v-if="canOpenPushSettings"
              class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div class="text-sm font-black text-slate-800">通知推播設定</div>
                <p class="mt-2 text-sm text-gray-600 leading-relaxed">
                  若要讓這台手機收到請假通知，請先從這裡開啟裝置推播授權與綁定。
                </p>
              </div>

              <button
                type="button"
                class="shrink-0 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold px-5 py-3 transition-colors"
                @click="openPushSettings"
              >
                前往設定
              </button>
            </div>

            <div class="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-4">
              <div class="text-sm font-black text-amber-800">這頁目前會更新的內容</div>
              <p class="mt-2 text-sm text-amber-700 leading-relaxed">
                大頭照、綽號 / 稱呼、常用匯款方式、匯款帳號後五碼。
                真實姓名與角色仍維持原本的管理流程。
              </p>
            </div>

            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
              <button
                type="button"
                class="rounded-2xl border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300 font-bold px-5 py-3 transition-colors"
                @click="resetForm"
              >
                還原目前資料
              </button>

              <button
                type="button"
                class="rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold px-6 py-3 transition-colors disabled:opacity-70"
                :disabled="isSubmitting || isCompressing"
                @click="submitForm"
              >
                {{ isSubmitting ? '儲存中...' : '儲存個人設定' }}
              </button>
            </div>
          </el-form>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { compressImage } from '@/utils/imageCompressor'
import {
  normalizeAccountLast5,
  PAYMENT_METHOD_OPTIONS,
  requiresAccountLast5 as checkRequiresAccountLast5
} from '@/utils/paymentMethods'

const MAX_AVATAR_BYTES = 1024 * 1024
const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const router = useRouter()
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()

const isLoading = ref(true)
const isCompressing = ref(false)
const isSubmitting = ref(false)
const formRef = ref()
const fileInput = ref<HTMLInputElement | null>(null)
const avatarFile = ref<File | null>(null)
const avatarPreview = ref('')

const form = reactive({
  nickname: '',
  avatar_url: '',
  preferred_payment_method: '',
  preferred_account_last_5: ''
})

const rules = {
  nickname: [
    {
      max: 20,
      message: '綽號請控制在 20 個字以內',
      trigger: ['blur', 'change']
    }
  ],
  preferred_account_last_5: [
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!requiresAccountLast5.value) {
          callback()
          return
        }

        if (!value) {
          callback(new Error('請輸入匯款帳號後五碼'))
          return
        }

        if (!/^\d{5}$/.test(value)) {
          callback(new Error('請輸入 5 位數字'))
          return
        }

        callback()
      },
      trigger: ['blur', 'change']
    }
  ]
}

const currentRoleName = computed(() => {
  const role = authStore.profile?.role
  const roleMap: Record<string, string> = {
    ADMIN: '系統管理員',
    MANAGER: '管理員',
    HEAD_COACH: '總教練',
    COACH: '教練'
  }

  if (!role) {
    return '一般成員'
  }

  return roleMap[role] || role
})

const currentDisplayName = computed(() => form.nickname.trim() || authStore.profile?.name || '球隊夥伴')
const avatarDisplayUrl = computed(() => avatarPreview.value || form.avatar_url)
const requiresAccountLast5 = computed(() => {
  return checkRequiresAccountLast5(form.preferred_payment_method)
})
const canOpenPushSettings = computed(() => permissionsStore.can('leave_requests', 'VIEW'))

const openPushSettings = () => {
  void router.push({
    path: '/leave-requests',
    query: {
      open_push_settings: '1'
    }
  })
}

const revokeAvatarPreview = () => {
  if (avatarPreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(avatarPreview.value)
  }

  avatarPreview.value = ''
}

const normalizeText = (value: string) => {
  const nextValue = value.trim()
  return nextValue.length > 0 ? nextValue : null
}

const normalizeDigits = (value: string) => {
  const nextValue = value.replace(/\D/g, '').slice(0, 5)
  return nextValue.length > 0 ? nextValue : null
}

const syncFormFromProfile = () => {
  form.nickname = authStore.profile?.nickname || ''
  form.avatar_url = authStore.profile?.avatar_url || ''
  form.preferred_payment_method = authStore.profile?.preferred_payment_method || ''
  form.preferred_account_last_5 = authStore.profile?.preferred_account_last_5 || ''
  avatarFile.value = null
  revokeAvatarPreview()
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handlePaymentMethodChange = (value: string | undefined) => {
  if (!checkRequiresAccountLast5(value)) {
    form.preferred_account_last_5 = ''
  }
}

const handleAccountLast5Input = (value: string) => {
  form.preferred_account_last_5 = normalizeAccountLast5(value)
}

const handleAvatarSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  if (!file.type.startsWith('image/')) {
    ElMessage.warning('請選擇圖片檔案')
    input.value = ''
    return
  }

  try {
    isCompressing.value = true
    const compressedFile = await compressImage(file, 1024, 1024, 0.82, MAX_AVATAR_BYTES)

    if (compressedFile.size > MAX_AVATAR_BYTES) {
      throw new Error('圖片壓縮後仍超過 1MB，請換一張較小的圖片')
    }

    avatarFile.value = compressedFile
    revokeAvatarPreview()
    avatarPreview.value = URL.createObjectURL(compressedFile)
    ElMessage.success('圖片已處理完成，儲存後就會更新')
  } catch (error: any) {
    ElMessage.error(error?.message || '圖片處理失敗，請稍後再試')
  } finally {
    isCompressing.value = false
    input.value = ''
  }
}

const clearAvatar = () => {
  avatarFile.value = null
  form.avatar_url = ''
  revokeAvatarPreview()
}

const uploadAvatar = async (userId: string) => {
  if (!avatarFile.value) {
    return form.avatar_url || null
  }

  const fileExt = avatarFile.value.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filePath = `profiles/${userId}/avatar-${Date.now()}.${fileExt}`
  const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, avatarFile.value)

  if (uploadError) {
    throw new Error('大頭照上傳失敗，請確認 Storage 已建立 avatars 儲存桶')
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return data.publicUrl
}

const resetForm = () => {
  syncFormFromProfile()
  formRef.value?.clearValidate?.()
}

const submitForm = async () => {
  if (!formRef.value) {
    return
  }

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) {
      return
    }

    if (!authStore.user?.id) {
      ElMessage.error('目前尚未登入，請重新登入後再試')
      return
    }

    isSubmitting.value = true

    try {
      const finalAvatarUrl = await uploadAvatar(authStore.user.id)
      const normalizedNickname = normalizeText(form.nickname)
      const normalizedPaymentMethod = normalizeText(form.preferred_payment_method)
      const normalizedAccountLast5 = checkRequiresAccountLast5(normalizedPaymentMethod)
        ? normalizeDigits(form.preferred_account_last_5)
        : null

      const { data, error } = await supabase.rpc('update_my_profile_settings', {
        p_nickname: normalizedNickname,
        p_avatar_url: finalAvatarUrl,
        p_preferred_payment_method: normalizedPaymentMethod,
        p_preferred_account_last_5: normalizedAccountLast5
      })

      if (error) {
        throw error
      }

      const updatedProfile = (Array.isArray(data) ? data[0] : data) || {}

      form.nickname = updatedProfile.nickname || normalizedNickname || ''
      form.avatar_url = updatedProfile.avatar_url || finalAvatarUrl || ''
      form.preferred_payment_method = updatedProfile.preferred_payment_method || normalizedPaymentMethod || ''
      form.preferred_account_last_5 = updatedProfile.preferred_account_last_5 || normalizedAccountLast5 || ''

      authStore.profile = {
        ...(authStore.profile || {}),
        nickname: form.nickname || null,
        avatar_url: form.avatar_url || null,
        preferred_payment_method: form.preferred_payment_method || null,
        preferred_account_last_5: form.preferred_account_last_5 || null,
        updated_at: updatedProfile.updated_at || new Date().toISOString()
      }

      avatarFile.value = null
      revokeAvatarPreview()
      ElMessage.success('個人設定已更新')
    } catch (error: any) {
      ElMessage.error(error?.message || '儲存失敗，請稍後再試')
    } finally {
      isSubmitting.value = false
    }
  })
}

onMounted(async () => {
  try {
    await authStore.ensureInitialized()
    syncFormFromProfile()
  } finally {
    isLoading.value = false
  }
})

onUnmounted(() => {
  revokeAvatarPreview()
})
</script>
