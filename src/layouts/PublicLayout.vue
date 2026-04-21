<template>
  <div class="min-h-screen flex flex-col bg-white font-sans overflow-x-hidden">
    <header class="sticky top-0 z-40 flex h-20 items-center justify-between border-b-4 border-primary bg-slate-900 px-4 text-white shadow-lg sm:px-6 md:px-12">
      <div class="flex min-w-0 items-center gap-3 sm:gap-4">
        <div class="flex h-12 w-12 items-center justify-center">
          <img src="/logo.jpg" alt="Logo" class="h-full w-full object-contain drop-shadow-md" />
        </div>
        <div class="min-w-0">
          <h1 class="max-w-[8.5rem] truncate text-lg font-black uppercase leading-none tracking-widest text-primary sm:max-w-none sm:text-2xl">
            中港熊讚社區棒球
          </h1>
        </div>
      </div>

      <nav class="absolute left-1/2 hidden -translate-x-1/2 gap-10 font-bold tracking-wide md:flex">
        <router-link to="/" class="cursor-pointer uppercase text-white transition-colors hover:text-secondary">首頁</router-link>
        <a class="cursor-pointer uppercase text-white transition-colors hover:text-secondary">賽事資訊</a>
        <button
          type="button"
          @click="scrollToAnnouncements"
          class="cursor-pointer border-none bg-transparent uppercase text-white transition-colors hover:text-secondary"
        >
          最新公告
        </button>
        <button
          type="button"
          @click="triggerJoinModal"
          class="cursor-pointer border-none bg-transparent uppercase text-white transition-colors hover:text-secondary"
        >
          我要報名
        </button>
      </nav>

      <div class="flex shrink-0 items-center gap-2 sm:gap-4">
        <button
          v-if="hasUpdateAvailable"
          type="button"
          @click="refreshApp"
          class="hidden items-center gap-1.5 rounded-full bg-[#D88F22] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors touch-manipulation animate-pulse sm:flex md:hover:bg-[#b87a1d]"
          title="偵測到新版本，重新整理即可更新"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          更新
        </button>

        <button
          v-if="hasUpdateAvailable"
          type="button"
          @click="refreshApp"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D88F22] text-white shadow-sm transition-transform touch-manipulation animate-pulse active:scale-[0.98] sm:hidden"
          aria-label="更新應用程式"
          title="偵測到新版本，重新整理即可更新"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button
          v-if="authStore.isAuthenticated"
          type="button"
          @click="goToDashboard"
          class="flex min-h-11 min-w-[92px] max-w-[132px] items-center justify-end rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right text-white transition-colors touch-manipulation active:scale-[0.98] active:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/70 sm:min-h-0 sm:min-w-0 sm:max-w-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0"
        >
          <span class="flex min-w-0 flex-col items-end">
            <span class="truncate text-sm font-bold leading-tight tracking-widest">
              {{ authStore.profile?.nickname || authStore.profile?.name || '管理後台' }}
            </span>
            <span class="mt-0.5 max-w-full truncate text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {{ getRoleName(authStore.profile?.role) }}
            </span>
          </span>
        </button>

        <button
          v-else
          type="button"
          @click="showLogin = true"
          class="border-none bg-transparent p-0 font-bold uppercase tracking-widest text-white transition-colors touch-manipulation md:hover:text-secondary"
        >
          登入
        </button>
      </div>
    </header>

    <main class="relative flex flex-1 flex-col">
      <router-view />
    </main>

    <footer class="border-t border-slate-800 bg-slate-900 pb-8 pt-16">
      <div class="mx-auto mb-12 flex max-w-7xl flex-col items-center justify-between gap-8 px-6 md:flex-row md:px-12">
        <div class="flex items-center gap-4">
          <div class="flex h-16 w-16 items-center justify-center">
            <img src="/logo.jpg" alt="Logo" class="h-full w-full object-contain" />
          </div>
          <div>
            <h2 class="text-2xl font-black uppercase tracking-widest text-primary">中港熊讚社區棒球</h2>
            <p class="mt-1 text-sm font-medium text-slate-400">一起在球場上成長，陪孩子打出自信與團隊感。</p>
          </div>
        </div>
        <div class="flex gap-6 text-slate-400">
          <a class="cursor-pointer font-bold transition-colors hover:text-primary">Privacy Policy</a>
          <a class="cursor-pointer font-bold transition-colors hover:text-primary">Terms of Service</a>
          <a class="cursor-pointer font-bold transition-colors hover:text-primary">Contact Us</a>
        </div>
      </div>
      <div class="mx-auto max-w-7xl border-t border-slate-800 pt-8 text-center text-sm font-medium text-slate-500">
        <p>&copy; 2026 中港熊讚社區棒球. Designed for excellence. All rights reserved.</p>
      </div>
    </footer>

    <LoginModal v-model="showLogin" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import LoginModal from '@/components/LoginModal.vue'
import { useVersionCheck } from '@/composables/useVersionCheck'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const showLogin = ref(false)
const { hasUpdateAvailable, refreshApp } = useVersionCheck()

const getRoleName = (role?: string) => {
  const dict: Record<string, string> = {
    ADMIN: '管理員',
    MANAGER: '經理',
    HEAD_COACH: '總教練',
    COACH: '教練'
  }

  return role ? (dict[role] || role) : '尚未設定'
}

const goToDashboard = () => {
  if (router.currentRoute.value.path === '/dashboard') return
  void router.push('/dashboard')
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
