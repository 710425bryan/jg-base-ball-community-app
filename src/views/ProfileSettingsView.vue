<template>
  <div class="min-h-full flex flex-col relative animate-fade-in bg-gray-50 text-text">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0">
      <div class="max-w-5xl mx-auto">
          <AppPageHeader
            title="個人設定"
            subtitle="更新大頭照、綽號、閱讀偏好、快速登入與常用匯款資訊"
            :icon="Setting"
            as="h2"
          />
      </div>
    </div>

    <div class="min-h-0 flex-1 p-4 pb-5 md:p-6 md:pb-6">
      <AppLoadingState v-if="isLoading" text="讀取個人設定中..." min-height="50vh" />

      <div v-else class="max-w-5xl mx-auto grid gap-4 lg:grid-cols-[320px,1fr]">
        <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6">
          <div class="flex flex-col items-center text-center">
            <button
              type="button"
              class="relative w-32 h-32 rounded-full border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden cursor-pointer group"
              aria-label="更換大頭照"
              title="更換大頭照"
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
            </button>

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
                class="w-full rounded-xl bg-primary py-3 font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-70"
                :disabled="isCompressing"
                @click="triggerFileInput"
              >
                {{ isCompressing ? '圖片處理中...' : '上傳新大頭照' }}
              </button>

              <button
                v-if="avatarDisplayUrl"
                type="button"
                class="w-full rounded-xl border border-gray-200 py-3 font-bold text-gray-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
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

            <div class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div class="text-sm font-black text-slate-800">系統推播通知</div>
                <p class="mt-2 text-sm text-gray-600 leading-relaxed">
                  若要讓這台手機收到明日賽事提醒、請假通知與其他系統通知，請先從這裡開啟裝置推播授權與綁定。
                </p>
              </div>

              <button
                type="button"
                class="shrink-0 rounded-xl bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-hover"
                @click="isPushSettingsOpen = true"
              >
                前往設定
              </button>
            </div>

            <div class="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div class="text-sm font-black text-slate-800">Passkey 快速登入</div>
                  <p class="mt-2 text-sm text-slate-600 leading-relaxed">
                    綁定後可用這台裝置的生物辨識或裝置解鎖快速登入，email 驗證碼仍會保留。
                  </p>
                </div>

                <button
                  v-if="isPasskeyAvailable"
                  type="button"
                  class="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-70"
                  :disabled="isRegisteringPasskey || isLoadingPasskeys"
                  @click="handleRegisterPasskey"
                >
                  <Loading v-if="isRegisteringPasskey" class="h-4 w-4 animate-spin" />
                  <Plus v-else class="h-4 w-4" />
                  <span>{{ isRegisteringPasskey ? '新增中...' : '新增 Passkey' }}</span>
                </button>
              </div>

              <div
                v-if="!isPasskeyAvailable"
                class="mt-4 rounded-xl border border-white/70 bg-white/80 px-4 py-3 text-sm font-medium text-slate-500"
              >
                這台裝置、瀏覽器或目前載入的登入 SDK 暫不支援 Passkey，仍可使用 email 驗證碼登入。
              </div>

              <div v-else class="mt-4">
                <div
                  v-if="isLoadingPasskeys"
                  class="flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-4 py-3 text-sm font-bold text-slate-500"
                >
                  <Loading class="h-4 w-4 animate-spin" />
                  <span>讀取 Passkey 中...</span>
                </div>

                <div
                  v-else-if="passkeys.length === 0"
                  class="rounded-xl border border-dashed border-emerald-200 bg-white/70 px-4 py-4 text-center text-sm font-bold text-slate-500"
                >
                  尚未綁定 Passkey
                </div>

                <div v-else class="space-y-3">
                  <div
                    v-for="passkey in passkeys"
                    :key="passkey.id"
                    class="flex flex-col gap-3 rounded-xl border border-white/70 bg-white/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div class="min-w-0">
                      <div class="truncate text-sm font-black text-slate-800">
                        {{ getPasskeyDisplayName(passkey) }}
                      </div>
                      <div class="mt-1 text-xs font-medium text-slate-500">
                        建立 {{ formatPasskeyDate(passkey.created_at) }}
                      </div>
                      <div class="mt-0.5 text-xs font-medium text-slate-400">
                        最近使用 {{ formatPasskeyDate(passkey.last_used_at) }}
                      </div>
                    </div>

                    <div class="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        class="app-icon-button"
                        :aria-label="`重新命名 ${getPasskeyDisplayName(passkey)}`"
                        :title="`重新命名 ${getPasskeyDisplayName(passkey)}`"
                        :disabled="passkeyActionId === passkey.id"
                        @click="handleRenamePasskey(passkey)"
                      >
                        <EditPen class="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        class="app-icon-button !border-red-100 !text-red-500 hover:!border-red-200 hover:!bg-red-50"
                        :aria-label="`刪除 ${getPasskeyDisplayName(passkey)}`"
                        :title="`刪除 ${getPasskeyDisplayName(passkey)}`"
                        :disabled="passkeyActionId === passkey.id"
                        @click="handleDeletePasskey(passkey)"
                      >
                        <Delete class="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div class="text-sm font-black text-slate-800">大字模式</div>
                <p class="mt-2 text-sm text-slate-600 leading-relaxed">
                  適合覺得文字太小的使用者，會放大全站主要文字、表單、按鈕與通知內容。設定會保留在這台裝置。
                </p>
              </div>

              <el-switch
                v-model="readableTextModeModel"
                size="large"
                inline-prompt
                active-text="開"
                inactive-text="關"
                aria-label="大字模式"
              />
            </div>

            <div class="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-4">
              <div class="text-sm font-black text-amber-800">這頁目前會更新的內容</div>
              <p class="mt-2 text-sm text-amber-700 leading-relaxed">
                大頭照、綽號 / 稱呼、大字模式、常用匯款方式、匯款帳號後五碼。
                Passkey 快速登入會在操作後即時更新。
                真實姓名與角色仍維持原本的管理流程。
              </p>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-2 md:flex md:justify-end">
              <button
                type="button"
                class="rounded-xl border border-gray-200 px-5 py-3 font-bold text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
                @click="resetForm"
              >
                還原目前資料
              </button>

              <button
                type="button"
                class="rounded-xl bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-70"
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

    <PushSettingsDialog v-model="isPushSettingsOpen" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, EditPen, Loading, Plus, Setting } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import PushSettingsDialog from '@/components/PushSettingsDialog.vue'
import { useReadableTextMode } from '@/composables/useReadableTextMode'
import { supabase } from '@/services/supabase'
import { useAuthStore, type AuthPasskey } from '@/stores/auth'
import { compressImage } from '@/utils/imageCompressor'
import {
  normalizeAccountLast5,
  PAYMENT_METHOD_OPTIONS,
  requiresAccountLast5 as checkRequiresAccountLast5
} from '@/utils/paymentMethods'
import {
  getPasskeyAuthErrorMessage,
  isPasskeySupported as detectPasskeySupport,
  isSupabasePasskeyServerEnabled
} from '@/utils/passkeySupport'

const MAX_AVATAR_BYTES = 1024 * 1024
const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const authStore = useAuthStore()
const { isReadableTextMode, setReadableTextMode } = useReadableTextMode()

const isLoading = ref(true)
const isCompressing = ref(false)
const isSubmitting = ref(false)
const isPushSettingsOpen = ref(false)
const isPasskeyAvailable = ref(false)
const isLoadingPasskeys = ref(false)
const isRegisteringPasskey = ref(false)
const passkeyActionId = ref('')
const passkeys = ref<AuthPasskey[]>([])
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
const readableTextModeModel = computed({
  get: () => isReadableTextMode.value,
  set: (value: boolean) => setReadableTextMode(value)
})
const requiresAccountLast5 = computed(() => {
  return checkRequiresAccountLast5(form.preferred_payment_method)
})

const passkeyDateFormatter = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'medium',
  timeStyle: 'short'
})

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

const formatPasskeyDate = (value?: string | null) => {
  if (!value) {
    return '尚未使用'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '未知時間'
  }

  return passkeyDateFormatter.format(date)
}

const getPasskeyDisplayName = (passkey: AuthPasskey) => {
  return passkey.friendly_name?.trim() || '未命名 Passkey'
}

const loadPasskeys = async () => {
  if (!isPasskeyAvailable.value) {
    passkeys.value = []
    return
  }

  isLoadingPasskeys.value = true

  try {
    passkeys.value = await authStore.listPasskeys()
  } catch (error: any) {
    console.error('Passkey 清單讀取失敗:', error)
    ElMessage.error(error?.message || 'Passkey 清單讀取失敗，請稍後再試')
  } finally {
    isLoadingPasskeys.value = false
  }
}

const refreshPasskeyAvailability = async () => {
  isPasskeyAvailable.value =
    detectPasskeySupport() &&
    authStore.isPasskeyApiAvailable &&
    await isSupabasePasskeyServerEnabled()
}

const handleRegisterPasskey = async () => {
  if (!isPasskeyAvailable.value) {
    return
  }

  isRegisteringPasskey.value = true

  try {
    await authStore.registerPasskey()
    await loadPasskeys()
    ElMessage.success('Passkey 已新增')
  } catch (error: any) {
    console.error('Passkey 新增失敗:', error)
    ElMessage.error(getPasskeyAuthErrorMessage(error, '新增 Passkey 失敗，請稍後再試'))
  } finally {
    isRegisteringPasskey.value = false
  }
}

const handleRenamePasskey = async (passkey: AuthPasskey) => {
  try {
    const { value } = await ElMessageBox.prompt('請輸入新的 Passkey 名稱', '重新命名 Passkey', {
      inputValue: getPasskeyDisplayName(passkey),
      inputPattern: /\S/,
      inputErrorMessage: '請輸入 Passkey 名稱',
      confirmButtonText: '儲存',
      cancelButtonText: '取消'
    })

    passkeyActionId.value = passkey.id
    await authStore.renamePasskey(passkey.id, String(value))
    await loadPasskeys()
    ElMessage.success('Passkey 名稱已更新')
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') {
      return
    }

    console.error('Passkey 改名失敗:', error)
    ElMessage.error(error?.message || 'Passkey 改名失敗，請稍後再試')
  } finally {
    if (passkeyActionId.value === passkey.id) {
      passkeyActionId.value = ''
    }
  }
}

const handleDeletePasskey = async (passkey: AuthPasskey) => {
  try {
    await ElMessageBox.confirm('刪除後，這把 Passkey 將無法再用來登入。', '刪除 Passkey', {
      type: 'warning',
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger'
    })

    passkeyActionId.value = passkey.id
    await authStore.deletePasskey(passkey.id)
    await loadPasskeys()
    ElMessage.success('Passkey 已刪除')
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') {
      return
    }

    console.error('Passkey 刪除失敗:', error)
    ElMessage.error(error?.message || 'Passkey 刪除失敗，請稍後再試')
  } finally {
    if (passkeyActionId.value === passkey.id) {
      passkeyActionId.value = ''
    }
  }
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
    await refreshPasskeyAvailability()
    await loadPasskeys()
  } finally {
    isLoading.value = false
  }
})

onUnmounted(() => {
  revokeAvatarPreview()
})
</script>
