<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="login-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="closeModal"></div>

        <!-- 公開登入保留品牌卡片；限制高度並提供內部捲動，讓短螢幕也能重新寄碼。 -->
        <div role="dialog" aria-modal="true" aria-labelledby="login-title" class="login-card relative z-10 w-full max-w-sm overflow-y-auto rounded-3xl bg-white shadow-2xl animate-modal-pop">
          <button
            type="button"
            aria-label="關閉登入視窗"
            :disabled="isBusy"
            @click="closeModal"
            class="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-800 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div class="flex flex-col items-center px-8 py-10">
            <div class="mb-6 flex h-[180px] w-[180px] items-center justify-center rounded-[2.25rem] shadow-[0_14px_28px_rgba(15,23,42,0.12)]">
              <img src="/logo.jpg" alt="中港熊讚社區棒球 Logo" class="h-[160px] w-[160px] object-contain drop-shadow-md" />
            </div>

            <div class="mb-8 w-full text-center">
              <h2 id="login-title" class="mb-1 text-2xl font-black tracking-tight text-primary">會員登入</h2>
              <p class="text-sm font-medium text-gray-500">輸入你的 email，我們會寄送一次性驗證碼給你。</p>
            </div>

            <form v-if="!isEmailSent" class="w-full space-y-4" @submit.prevent="handleLogin">
              <button
                v-if="isPasskeyAvailable"
                data-testid="passkey-login-button"
                type="button"
                :disabled="isPasskeyLoading || isLoading"
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3.5 font-bold text-slate-800 shadow-sm transition-all hover:border-primary hover:text-primary active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
                @click="handlePasskeyLogin"
              >
                <Lock class="h-5 w-5" />
                <span>{{ isPasskeyLoading ? '驗證中...' : '使用 Passkey 登入' }}</span>
              </button>

              <div
                v-if="isPasskeyAvailable"
                class="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-300"
              >
                <span class="h-px flex-1 bg-gray-100"></span>
                <span>或</span>
                <span class="h-px flex-1 bg-gray-100"></span>
              </div>

              <div>
                <input
                  v-model="email"
                  type="email"
                  aria-label="登入 email"
                  autocomplete="email"
                  autocapitalize="none"
                  :disabled="isBusy"
                  required
                  class="w-full rounded-xl border border-gray-200 bg-gray-50 px-5 py-3.5 font-medium text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/50"
                  placeholder="your@email.com"
                />
              </div>

              <button
                type="submit"
                :disabled="isBusy || emailCooldown > 0"
                class="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-bold tracking-wider text-white shadow-[0_8px_20px_rgba(216,143,34,0.3)] transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
              >
                <span v-if="isLoading">送出中...</span>
                <span v-else-if="emailCooldown > 0">{{ emailCooldown }} 秒後可重新寄送</span>
                <span v-else>寄送登入驗證碼</span>
                <svg v-if="!isLoading" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </form>

            <div v-else class="w-full animate-fade-in py-2 text-center">
              <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-500 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 class="mb-2 text-lg font-bold text-gray-800">驗證碼已寄出</h3>
              <p class="mb-6 text-xs font-medium leading-relaxed text-gray-500">
                請到你的信箱收取 8 碼驗證碼
                <br />
                <span class="mt-1 inline-block break-all text-sm font-bold text-primary">{{ sentEmail }}</span>
              </p>

              <form class="space-y-4" @submit.prevent="handleVerifyOtp">
                <input
                  :value="otpCode"
                  @input="updateOtpCode"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  aria-label="8 碼驗證碼"
                  aria-describedby="otp-hint otp-error"
                  :aria-invalid="!!otpError"
                  :disabled="isBusy"
                  required
                  class="w-full rounded-xl border border-gray-200 bg-gray-50/80 px-5 py-3 text-center text-xl font-bold tracking-widest text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/50"
                  placeholder="輸入 8 碼驗證碼"
                />

                <button
                  type="submit"
                  :disabled="isBusy || !isValidOtpCode(otpCode)"
                  class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-white shadow-[0_8px_20px_rgba(216,143,34,0.3)] transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
                >
                  <span v-if="isVerifying">驗證中...</span>
                  <span v-else>完成登入</span>
                </button>
              </form>

              <p id="otp-hint" class="mt-3 text-xs leading-relaxed text-gray-500">
                請使用最新一封信中的驗證碼；每組驗證碼只能使用一次。
              </p>
              <p id="otp-error" ref="otpErrorElement" role="alert" class="mt-2 text-sm leading-relaxed text-red-600">{{ otpError }}</p>
              <button
                type="button"
                :disabled="isBusy || resendCooldown > 0"
                class="mt-3 min-h-11 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-primary disabled:text-gray-400"
                @click="handleResendOtp"
              >
                {{ isLoading ? '寄送中...' : resendCooldown > 0 ? `${resendCooldown} 秒後可重新寄送` : '重新寄送驗證碼' }}
              </button>
              <button
                type="button"
                :disabled="isBusy"
                class="mt-2 min-h-11 px-3 text-xs font-bold text-gray-500 underline decoration-dotted underline-offset-2 transition-colors hover:text-primary disabled:opacity-50"
                @click="resetEmailStep"
              >
                重新輸入 email
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useNow } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import {
  getOtpAuthErrorMessage,
  isValidOtpCode,
  normalizeLoginEmail,
  normalizeOtpCode,
  OTP_RESEND_COOLDOWN_SECONDS
} from '@/utils/otpLogin'
import {
  getPasskeyAuthErrorMessage,
  isPasskeySupported,
  isSupabasePasskeyServerEnabled
} from '@/utils/passkeySupport'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const authStore = useAuthStore()
const email = ref('')
const otpCode = ref('')
const isLoading = ref(false)
const isEmailSent = ref(false)
const isVerifying = ref(false)
const isPasskeyAvailable = ref(false)
const isPasskeyLoading = ref(false)
const sentEmail = ref('')
const otpError = ref('')
const otpErrorElement = ref<HTMLParagraphElement | null>(null)
const resendAvailableAt = ref(0)
const now = useNow({ interval: 1000 })
const resendCooldown = computed(() => Math.max(0, Math.ceil((resendAvailableAt.value - now.value.getTime()) / 1000)))
const emailCooldown = computed(() => normalizeLoginEmail(email.value) === sentEmail.value ? resendCooldown.value : 0)
const isBusy = computed(() => isLoading.value || isVerifying.value || isPasskeyLoading.value)
let passkeyAvailabilityRequestId = 0

const refreshPasskeyAvailability = async () => {
  const requestId = ++passkeyAvailabilityRequestId
  const isAvailable =
    isPasskeySupported() &&
    authStore.isPasskeyApiAvailable &&
    await isSupabasePasskeyServerEnabled()

  if (requestId === passkeyAvailabilityRequestId) {
    isPasskeyAvailable.value = isAvailable
  }
}

void refreshPasskeyAvailability()

watch(
  () => props.modelValue,
  (newValue) => {
    if (!newValue) return
    email.value = ''
    otpCode.value = ''
    otpError.value = ''
    isEmailSent.value = false
    isPasskeyLoading.value = false
    isPasskeyAvailable.value = false
    void refreshPasskeyAvailability()
  }
)

const handleLogin = async () => {
  if (!email.value || isBusy.value || emailCooldown.value > 0) return
  await sendOtp(normalizeLoginEmail(email.value))
}

const sendOtp = async (targetEmail: string) => {
  isLoading.value = true

  try {
    await authStore.sendMagicLink(targetEmail)
    email.value = targetEmail
    sentEmail.value = targetEmail
    otpCode.value = ''
    otpError.value = ''
    now.value = new Date()
    resendAvailableAt.value = Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000
    isEmailSent.value = true
    ElMessage.success('登入驗證碼已寄出')
  } catch (error: unknown) {
    const message = getOtpAuthErrorMessage(error, '寄送驗證碼失敗，請稍後再試。')
    if (isEmailSent.value) otpError.value = message
    ElMessage.error(message)
  } finally {
    isLoading.value = false
  }
}

const handleResendOtp = async () => {
  if (isBusy.value || resendCooldown.value > 0 || !sentEmail.value) return
  await sendOtp(sentEmail.value)
}

const updateOtpCode = (event: Event) => {
  const input = event.target as HTMLInputElement
  otpCode.value = normalizeOtpCode(input.value)
  input.value = otpCode.value
  otpError.value = ''
}

const resetEmailStep = () => {
  if (isBusy.value) return
  isEmailSent.value = false
  otpCode.value = ''
  otpError.value = ''
}

const closeModal = () => {
  if (!isBusy.value) emit('update:modelValue', false)
}

const handlePasskeyLogin = async () => {
  if (isBusy.value) return
  isPasskeyLoading.value = true

  try {
    await authStore.signInWithPasskey()
    ElMessage.success('登入成功，正在前往後台')
    emit('update:modelValue', false)
    void router.push('/dashboard')
  } catch (error: any) {
    console.error('Passkey 登入失敗:', error)
    ElMessage.error(getPasskeyAuthErrorMessage(error))
  } finally {
    isPasskeyLoading.value = false
  }
}

const handleVerifyOtp = async () => {
  if (isBusy.value || !isValidOtpCode(otpCode.value)) return
  isVerifying.value = true
  otpError.value = ''

  try {
    await authStore.verifyOtpCode(sentEmail.value, normalizeOtpCode(otpCode.value))
    ElMessage.success('登入成功，正在前往後台')
    emit('update:modelValue', false)
    void router.push('/dashboard')
  } catch (error: unknown) {
    otpError.value = getOtpAuthErrorMessage(error, '驗證未完成，請稍後再試或重新寄送驗證碼。')
    await nextTick()
    otpErrorElement.value?.scrollIntoView?.({ block: 'nearest' })
  } finally {
    isVerifying.value = false
    otpCode.value = ''
  }
}
</script>

<style scoped>
.login-overlay {
  padding-top: max(1rem, env(safe-area-inset-top));
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}

.login-card {
  max-height: calc(100vh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)));
  max-height: calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)));
  overscroll-behavior: contain;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.animate-modal-pop {
  animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes modalPop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(20px);
  }

  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
