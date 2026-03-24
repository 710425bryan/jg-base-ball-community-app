<template>
  <div class="w-full h-full flex items-center justify-center p-4">
    <div class="w-full max-w-sm p-8 md:p-10 bg-white/95 backdrop-blur-md rounded-3xl shadow-[0_20px_60px_rgb(0,0,0,0.08)] border border-white animate-fade-in flex flex-col items-center">
      
      <!-- 替換為真實 Logo 圖片 -->
      <div class="w-32 h-32 mb-6">
        <img src="/logo.png" alt="中港熊戰棒球隊" class="w-full h-full object-contain filter drop-shadow-md" />
      </div>

      <div class="text-center mb-8 w-full">
        <h1 class="text-3xl font-extrabold text-gray-800 mb-2 tracking-tight">中港熊戰棒球隊</h1>
        <p class="text-gray-500 font-medium">免密碼快速登入</p>
      </div>
      
      <form v-if="!isEmailSent" @submit.prevent="handleLogin" class="space-y-5 w-full">
        <div>
          <label class="block text-sm font-bold text-gray-700 mb-1.5 ml-1">電子信箱</label>
          <input v-model="email" type="email" required class="w-full px-5 py-3.5 bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all text-gray-800 placeholder-gray-400 font-medium" placeholder="輸入您的信箱" />
        </div>
        
        <!-- 改用明確的色碼 bg-orange-600以防 Tailwind var 跑版 -->
        <button type="submit" :disabled="isLoading" class="w-full py-3.5 mt-2 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 text-white font-bold rounded-xl shadow-[0_8px_20px_rgb(234,88,12,0.25)] transition-all flex items-center justify-center gap-2">
          <span v-if="isLoading">發送中...</span>
          <span v-else>發送登入信件</span>
          <svg v-if="!isLoading" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
        </button>
        
        <!-- 開發者一鍵登入後門 (Mock Login) -->
        <div class="mt-4 text-center">
          <button @click.prevent="handleMockLogin" type="button" class="text-xs font-medium text-gray-400 hover:text-orange-500 transition-colors underline decoration-dotted underline-offset-2">
            開發期間繞過錯誤直接登入 (Mock Login)
          </button>
        </div>
      </form>

      <div v-else class="text-center py-4 animate-fade-in w-full">
        <div class="w-16 h-16 bg-green-100 text-green-500 rounded-full mx-auto flex items-center justify-center mb-4 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" /></svg>
        </div>
        <h3 class="text-xl font-bold text-gray-800 mb-2">登入信件已發送！</h3>
        <p class="text-gray-500 font-medium leading-relaxed text-sm mb-6">我們已將登入信件發送至<br/><span class="text-orange-600 font-bold text-base mt-0.5 inline-block">{{ email }}</span><br/>您可以點擊信內連結，或在下方輸入 8 位數驗證碼：</p>
        
        <form @submit.prevent="handleVerifyOtp" class="space-y-4">
          <input v-model="otpCode" type="text" maxlength="8" required class="w-full px-5 py-3.5 bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all text-center tracking-widest text-2xl text-gray-800 placeholder-gray-400 font-bold" placeholder="00000000" />
          
          <button type="submit" :disabled="isVerifying || otpCode.length !== 8" class="w-full py-3.5 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 text-white font-bold rounded-xl shadow-[0_8px_20px_rgb(234,88,12,0.25)] transition-all flex items-center justify-center gap-2">
            <span v-if="isVerifying">驗證中...</span>
            <span v-else>驗證登入</span>
          </button>
        </form>

        <button @click="isEmailSent = false; otpCode = ''" type="button" class="text-sm font-bold text-gray-400 hover:text-orange-600 transition-colors mt-6 underline decoration-dotted underline-offset-2">上一步：重新輸入信箱</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); scale: 0.95; } to { opacity: 1; transform: translateY(0); scale: 1; } }
</style>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

const router = useRouter()
const authStore = useAuthStore()
const email = ref('')
const otpCode = ref('')
const isLoading = ref(false)
const isEmailSent = ref(false)
const isVerifying = ref(false)

const handleMockLogin = () => {
  ElMessage.success('已使用開發者後門登入')
  router.push('/home')
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
    const errorMessage = err?.message || '未知錯誤'
    if (errorMessage.includes('rate_limit') || errorMessage.includes('sending magic link')) {
      ElMessage.error('發送頻率過高或伺服器無法發信，請檢查 Supabase 設定或稍後再試。')
    } else {
      ElMessage.error(`寄送失敗：${errorMessage}`)
    }
  } finally {
    isLoading.value = false
  }
}

const handleVerifyOtp = async () => {
  if (otpCode.value.length !== 8) return
  
  isVerifying.value = true
  try {
    await authStore.verifyOtpCode(email.value, otpCode.value)
    ElMessage.success('驗證成功，歡迎回來！')
    router.push('/home')
  } catch (err: any) {
    console.error('OTP 驗證失敗:', err)
    ElMessage.error(err?.message || '驗證碼錯誤或已過期，請重新確認。')
  } finally {
    isVerifying.value = false
    otpCode.value = ''
  }
}
</script>
