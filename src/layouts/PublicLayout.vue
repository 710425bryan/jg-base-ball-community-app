<template>
  <div class="min-h-screen flex flex-col bg-white font-sans overflow-x-hidden">
    <!-- Navbar -->
    <header class="h-20 bg-slate-900 text-white flex items-center justify-between px-6 md:px-12 sticky top-0 z-40 border-b-4 border-primary shadow-lg">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 flex items-center justify-center">
          <img src="/少棒元素_20260324_232837_0000.png" alt="Logo" class="w-full h-full object-contain drop-shadow-md" />
        </div>
        <div class="flex flex-col justify-center">
          <h1 class="text-2xl font-black tracking-widest text-primary leading-none uppercase">
            中港熊戰棒球隊
          </h1>
          <!-- <span class="text-xs text-secondary font-bold tracking-widest uppercase mt-1">官方網站</span> -->
        </div>
      </div>
      
      <!-- Nav Links -->
      <nav class="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-10 font-bold tracking-wide">
        <router-link to="/" class="text-white hover:text-secondary transition-colors uppercase cursor-pointer">首頁</router-link>
        <a class="text-white hover:text-secondary transition-colors uppercase cursor-pointer">賽程表</a>
        <a @click="scrollToAnnouncements" class="text-white hover:text-secondary transition-colors uppercase cursor-pointer">最新公告</a>
        <a @click="triggerJoinModal" class="text-white hover:text-secondary transition-colors uppercase cursor-pointer">加入我們</a>
      </nav>
      
      <!-- Login / Dashboard btn -->
      <div class="flex items-center gap-4">
        <!-- 首頁專屬：更新按鈕 -->
        <button v-if="hasUpdateAvailable" @click="refreshApp" class="bg-[#D88F22] hover:bg-[#b87a1d] text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors animate-pulse shadow-sm" title="點擊重新整理以獲取最新功能">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          更新可用
        </button>

        <router-link v-if="authStore.isAuthenticated" to="/dashboard" class="flex flex-col items-end group cursor-pointer text-white hover:text-secondary transition-colors text-right">
          <span class="font-bold tracking-widest text-sm leading-tight group-hover:text-secondary transition-colors">{{ authStore.profile?.name || '管理員' }}</span>
          <span class="text-[10px] text-gray-400 font-bold tracking-widest uppercase truncate max-w-[80px] mt-0.5">{{ getRoleName(authStore.profile?.role) }}</span>
        </router-link>
        <button v-else @click="showLogin = true" class="text-white hover:text-secondary transition-colors font-bold tracking-widest uppercase cursor-pointer bg-transparent border-none p-0 outline-none">
          登入
        </button>
      </div>
    </header>

    <!-- Page Content (Landing) -->
    <main class="flex-1 flex flex-col relative w-full">
      <router-view />
    </main>
    
    <!-- Footer -->
    <footer class="bg-slate-900 pt-16 pb-8 border-t border-slate-800">
      <div class="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 flex items-center justify-center">
            <img src="/少棒元素_20260324_232837_0000.png" alt="Logo" class="w-full h-full object-contain" />
          </div>
          <div>
            <h2 class="text-2xl font-black tracking-widest text-primary uppercase">中港熊戰棒球隊</h2>
            <p class="text-slate-400 font-medium text-sm mt-1">成為場上的影響力。2026賽季。</p>
          </div>
        </div>
        <div class="flex gap-6 text-slate-400">
          <a class="hover:text-primary transition-colors cursor-pointer font-bold">Privacy Policy</a>
          <a class="hover:text-primary transition-colors cursor-pointer font-bold">Terms of Service</a>
          <a class="hover:text-primary transition-colors cursor-pointer font-bold">Contact Us</a>
        </div>
      </div>
      <div class="text-center text-slate-500 font-medium text-sm border-t border-slate-800 pt-8 max-w-7xl mx-auto">
        <p>&copy; 2026 中港熊戰棒球隊. Designed for excellence. All rights reserved.</p>
      </div>
    </footer>

    <!-- Login Modal -->
    <LoginModal v-model="showLogin" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginModal from '@/components/LoginModal.vue'
import { useVersionCheck } from '@/composables/useVersionCheck'

const authStore = useAuthStore()
const router = useRouter()
const showLogin = ref(false)
const { hasUpdateAvailable, refreshApp } = useVersionCheck()

const getRoleName = (role?: string) => {
  const dict: Record<string, string> = { 'ADMIN': '管理員', 'MANAGER': '經理', 'HEAD_COACH': '總教練', 'COACH': '教練' }
  return role ? (dict[role] || role) : '一般成員'
}

const triggerJoinModal = () => {
  if (router.currentRoute.value.path !== '/') {
    router.push('/').then(() => {
      setTimeout(() => window.dispatchEvent(new CustomEvent('openJoinModal')), 200)
    })
  } else {
    window.dispatchEvent(new CustomEvent('openJoinModal'))
  }
}

const scrollToAnnouncements = () => {
  if (router.currentRoute.value.path !== '/') {
    router.push('/').then(() => {
      setTimeout(() => {
        document.getElementById('announcements')?.scrollIntoView({ behavior: 'smooth' })
      }, 200)
    })
  } else {
    document.getElementById('announcements')?.scrollIntoView({ behavior: 'smooth' })
  }
}
</script>
