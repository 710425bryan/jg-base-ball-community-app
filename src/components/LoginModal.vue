<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="$emit('update:modelValue', false)"></div>
        
        <!-- Modal Content -->
        <div class="bg-white rounded-3xl overflow-hidden shadow-2xl relative w-full max-w-sm z-10 animate-modal-pop">
          <!-- Close button -->
          <button @click="$emit('update:modelValue', false)" class="absolute top-5 right-5 text-gray-400 hover:text-gray-800 transition-colors z-20 bg-gray-100 hover:bg-gray-200 rounded-full p-1">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          
          <div class="px-8 py-10 flex flex-col items-center">
            
            <div class="w-24 h-24 mb-6 bg-slate-800 rounded-2xl flex items-center justify-center shadow-lg border border-primary/20">
              <span class="text-4xl drop-shadow-lg">🐻</span>
            </div>

            <div class="text-center mb-8 w-full">
              <h2 class="text-2xl font-black text-primary mb-1 tracking-tight">球隊入口登入</h2>
              <p class="text-gray-500 font-medium text-sm">請輸入電子信箱以獲取魔術連結</p>
            </div>
            
            <form v-if="!isEmailSent" @submit.prevent="handleLogin" class="space-y-4 w-full">
              <div>
                <input v-model="email" type="email" required class="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all text-gray-800 placeholder-gray-400 font-medium" placeholder="your@email.com" />
              </div>
              
              <button type="submit" :disabled="isLoading" class="w-full py-3.5 mt-2 bg-primary hover:bg-primary-hover active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 text-white font-bold rounded-xl shadow-[0_8px_20px_rgba(216,143,34,0.3)] transition-all flex items-center justify-center gap-2 tracking-wider">
                <span v-if="isLoading">發送中...</span>
                <span v-else>發送登入信件</span>
                <svg v-if="!isLoading" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
              </button>
              
              <div class="mt-4 text-center">
                <button @click.prevent="handleMockLogin" type="button" class="text-xs font-bold text-gray-400 hover:text-primary transition-colors underline decoration-dotted underline-offset-2">
                  開發者快速登入通道 (Mock Login)
                </button>
              </div>
            </form>

            <div v-else class="text-center py-2 animate-fade-in w-full">
              <div class="w-14 h-14 bg-green-50 text-green-500 rounded-full mx-auto flex items-center justify-center mb-4 shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 class="text-lg font-bold text-gray-800 mb-2">信件已發出！</h3>
              <p class="text-gray-500 font-medium leading-relaxed text-xs mb-6">我們已將魔術連結寄至<br/><span class="text-primary font-bold text-sm mt-1 inline-block">{{ email }}</span></p>
              
              <form @submit.prevent="handleVerifyOtp" class="space-y-4">
                <input v-model="otpCode" type="text" maxlength="8" required class="w-full px-5 py-3 bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all text-center tracking-widest text-xl text-gray-800 placeholder-gray-400 font-bold" placeholder="輸入 8 碼驗證" />
                
                <button type="submit" :disabled="isVerifying || otpCode.length !== 8" class="w-full py-3 bg-primary hover:bg-primary-hover active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 text-white font-bold rounded-xl shadow-[0_8px_20px_rgba(216,143,34,0.3)] transition-all flex items-center justify-center gap-2">
                  <span v-if="isVerifying">驗證中...</span>
                  <span v-else>立即登入</span>
                </button>
              </form>

              <button @click="isEmailSent = false; otpCode = ''" type="button" class="text-xs font-bold text-gray-400 hover:text-primary transition-colors mt-6 underline decoration-dotted underline-offset-2">重新輸入信箱</button>
            </div>

          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits(['update:modelValue'])

const router = useRouter()
const authStore = useAuthStore()
const email = ref('')
const otpCode = ref('')
const isLoading = ref(false)
const isEmailSent = ref(false)
const isVerifying = ref(false)

// Reset state when modal opens
watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    email.value = ''
    otpCode.value = ''
    isEmailSent.value = false
  }
})

const handleMockLogin = async () => {
  ElMessage.success('已使用開發者後門登入')
  emit('update:modelValue', false)
  router.push('/dashboard')
}

const handleLogin = async () => {
  if (!email.value) return
  isLoading.value = true
  try {
    await authStore.sendMagicLink(email.value)
    isEmailSent.value = true
    ElMessage.success('登入魔術連結已寄出！')
  } catch (err: any) {
    console.error('登入失敗:', err)
    ElMessage.error(err?.message || '發信失敗，請稍後再試。')
  } finally {
    isLoading.value = false
  }
}

const handleVerifyOtp = async () => {
  if (otpCode.value.length !== 8) return
  isVerifying.value = true
  try {
    await authStore.verifyOtpCode(email.value, otpCode.value)
    ElMessage.success('登入成功，歡迎回來！')
    emit('update:modelValue', false)
    router.push('/dashboard')
  } catch (err: any) {
    console.error('OTP 驗證失敗:', err)
    ElMessage.error(err?.message || '驗證碼錯誤或已過期。')
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
