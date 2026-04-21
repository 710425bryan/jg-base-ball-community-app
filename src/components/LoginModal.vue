<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="$emit('update:modelValue', false)"></div>

        <div class="relative z-10 w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl animate-modal-pop">
          <button
            type="button"
            @click="$emit('update:modelValue', false)"
            class="absolute right-5 top-5 z-20 rounded-full bg-gray-100 p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-800"
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
              <h2 class="mb-1 text-2xl font-black tracking-tight text-primary">會員登入</h2>
              <p class="text-sm font-medium text-gray-500">輸入你的 email，我們會寄送一次性驗證碼給你。</p>
            </div>

            <form v-if="!isEmailSent" class="w-full space-y-4" @submit.prevent="handleLogin">
              <div>
                <input
                  v-model="email"
                  type="email"
                  required
                  class="w-full rounded-xl border border-gray-200 bg-gray-50 px-5 py-3.5 font-medium text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/50"
                  placeholder="your@email.com"
                />
              </div>

              <button
                type="submit"
                :disabled="isLoading"
                class="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 font-bold tracking-wider text-white shadow-[0_8px_20px_rgba(216,143,34,0.3)] transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
              >
                <span v-if="isLoading">送出中...</span>
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
                <span class="mt-1 inline-block text-sm font-bold text-primary">{{ email }}</span>
              </p>

              <form class="space-y-4" @submit.prevent="handleVerifyOtp">
                <input
                  v-model="otpCode"
                  type="text"
                  maxlength="8"
                  required
                  class="w-full rounded-xl border border-gray-200 bg-gray-50/80 px-5 py-3 text-center text-xl font-bold tracking-widest text-gray-800 outline-none transition-all placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/50"
                  placeholder="輸入 8 碼驗證碼"
                />

                <button
                  type="submit"
                  :disabled="isVerifying || otpCode.length !== 8"
                  class="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-white shadow-[0_8px_20px_rgba(216,143,34,0.3)] transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
                >
                  <span v-if="isVerifying">驗證中...</span>
                  <span v-else>完成登入</span>
                </button>
              </form>

              <button
                type="button"
                class="mt-6 text-xs font-bold text-gray-400 underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
                @click="isEmailSent = false; otpCode = ''"
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
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const authStore = useAuthStore()
const email = ref('')
const otpCode = ref('')
const isLoading = ref(false)
const isEmailSent = ref(false)
const isVerifying = ref(false)

watch(
  () => props.modelValue,
  (newValue) => {
    if (!newValue) return
    email.value = ''
    otpCode.value = ''
    isEmailSent.value = false
  }
)

const handleLogin = async () => {
  if (!email.value) return
  isLoading.value = true

  try {
    await authStore.sendMagicLink(email.value)
    isEmailSent.value = true
    ElMessage.success('登入驗證碼已寄出')
  } catch (error: any) {
    console.error('登入失敗:', error)
    ElMessage.error(error?.message || '寄送驗證碼失敗，請稍後再試')
  } finally {
    isLoading.value = false
  }
}

const handleVerifyOtp = async () => {
  if (otpCode.value.length !== 8) return
  isVerifying.value = true

  try {
    await authStore.verifyOtpCode(email.value, otpCode.value)
    ElMessage.success('登入成功，正在前往後台')
    emit('update:modelValue', false)
    void router.push('/dashboard')
  } catch (error: any) {
    console.error('OTP 驗證失敗:', error)
    ElMessage.error(error?.message || '驗證碼錯誤，請重新輸入')
  } finally {
    isVerifying.value = false
    otpCode.value = ''
  }
}
</script>

<style scoped>
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
