<template>
  <div class="min-h-screen flex flex-col bg-white font-sans overflow-x-hidden">
    <header class="sticky top-0 z-40 flex h-20 items-center justify-between border-b-4 border-primary bg-slate-900 px-4 text-white shadow-lg sm:px-6 md:px-12">
      <div class="flex min-w-0 items-center gap-3 sm:gap-4">
        <div class="flex h-12 w-12 items-center justify-center">
          <img src="/少棒元素_20260324_232837_0000.png" alt="中港熊戰社區棒球 Logo" class="h-full w-full object-contain drop-shadow-md" />
        </div>
        <div class="min-w-0">
          <h1 class="truncate text-lg font-black uppercase leading-none tracking-widest text-primary sm:text-2xl">
            中港熊戰社區棒球
          </h1>
        </div>
      </div>

      <nav class="absolute left-1/2 hidden -translate-x-1/2 gap-10 font-bold tracking-wide md:flex">
        <router-link to="/" class="cursor-pointer uppercase text-white transition-colors hover:text-secondary">首頁</router-link>
        <button
          type="button"
          @click="scrollToSchedule"
          class="cursor-pointer border-none bg-transparent uppercase text-white transition-colors hover:text-secondary"
        >
          賽事資訊
        </button>
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
          type="button"
          class="hidden min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-sm font-bold tracking-wider text-white transition-colors touch-manipulation hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/70 md:flex"
          :aria-pressed="isReadableTextMode"
          @click="toggleReadableTextMode"
        >
          <span>大字</span>
          <span class="rounded-full bg-white/10 px-2 py-0.5 text-xs text-secondary">
            {{ isReadableTextMode ? '開' : '關' }}
          </span>
        </button>

        <button
          v-if="authStore.isAuthenticated"
          type="button"
          @click="goToDashboard"
          class="flex min-h-11 min-w-[92px] max-w-[132px] items-center justify-end rounded-xl px-3 py-2 text-right text-white transition-colors touch-manipulation active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/70 sm:min-h-0 sm:min-w-0 sm:max-w-none sm:px-0 sm:py-0"
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
          class="min-h-11 rounded-lg border-none bg-transparent px-2 font-bold uppercase tracking-widest text-white transition-colors touch-manipulation md:min-h-0 md:p-0 md:hover:text-secondary"
        >
          登入
        </button>

        <button
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white transition-colors touch-manipulation hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/70 md:hidden"
          :aria-label="isMobileMenuOpen ? '關閉選單' : '開啟選單'"
          :aria-expanded="isMobileMenuOpen"
          @click="isMobileMenuOpen = !isMobileMenuOpen"
        >
          <el-icon class="text-xl">
            <Close v-if="isMobileMenuOpen" />
            <Menu v-else />
          </el-icon>
        </button>
      </div>
    </header>

    <button
      v-if="hasUpdateAvailable || isApplyingUpdate"
      type="button"
      :disabled="isApplyingUpdate"
      @click="refreshApp"
      class="sticky top-20 z-40 flex h-11 w-full items-center justify-center gap-2 overflow-hidden bg-sky-600 px-3 text-center text-xs font-bold text-white shadow-[0_4px_16px_rgba(2,132,199,0.35)] transition-colors touch-manipulation animate-fade-in-down hover:bg-sky-700 disabled:cursor-wait disabled:hover:bg-sky-600 sm:text-sm"
      :title="isApplyingUpdate ? '正在套用最新版本' : '點擊以重新載入系統獲取最新功能'"
    >
      <svg xmlns="http://www.w3.org/2000/svg" :class="['h-4 w-4 shrink-0 sm:h-5 sm:w-5', isApplyingUpdate ? 'animate-spin' : 'animate-bounce']" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span class="truncate">{{ isApplyingUpdate ? '正在套用最新版本...' : '系統已發布新版本，點擊重新整理以取得最新功能' }}</span>
    </button>

    <HolidayThemeRibbon />

    <nav
      v-if="isMobileMenuOpen"
      class="sticky z-30 border-b border-slate-800 bg-slate-950 px-4 py-4 text-white shadow-xl md:hidden"
      :class="hasUpdateAvailable || isApplyingUpdate ? 'top-[7.75rem]' : 'top-20'"
      aria-label="手機導覽"
    >
      <div class="grid grid-cols-2 gap-3">
        <router-link
          to="/"
          class="flex min-h-12 items-center justify-center rounded-xl bg-white/5 px-3 text-sm font-bold tracking-widest transition-colors hover:bg-white/10"
          @click="closeMobileMenu"
        >
          首頁
        </router-link>
        <button
          type="button"
          class="flex min-h-12 items-center justify-center rounded-xl bg-white/5 px-3 text-sm font-bold tracking-widest transition-colors hover:bg-white/10"
          @click="scrollToSchedule"
        >
          賽事資訊
        </button>
        <button
          type="button"
          class="flex min-h-12 items-center justify-center rounded-xl bg-white/5 px-3 text-sm font-bold tracking-widest transition-colors hover:bg-white/10"
          @click="scrollToAnnouncements"
        >
          最新公告
        </button>
        <button
          type="button"
          class="flex min-h-12 items-center justify-center rounded-xl bg-primary px-3 text-sm font-bold tracking-widest text-white transition-colors hover:bg-primary-hover"
          @click="triggerJoinModal"
        >
          我要報名
        </button>
        <a
          href="https://www.facebook.com/groups/203206672887263"
          target="_blank"
          rel="noopener noreferrer"
          class="flex min-h-12 items-center justify-center rounded-xl bg-white/5 px-3 text-sm font-bold tracking-widest transition-colors hover:bg-white/10"
          @click="closeMobileMenu"
        >
          FB
        </a>
        <a
          href="https://www.instagram.com/reel/DWIbtw4EZ55/"
          target="_blank"
          rel="noopener noreferrer"
          class="flex min-h-12 items-center justify-center rounded-xl bg-white/5 px-3 text-sm font-bold tracking-widest transition-colors hover:bg-white/10"
          @click="closeMobileMenu"
        >
          IG
        </a>
        <button
          type="button"
          class="col-span-2 flex min-h-12 items-center justify-center rounded-xl border border-secondary/30 bg-secondary/10 px-3 text-sm font-bold tracking-widest text-secondary transition-colors hover:bg-secondary/20"
          :aria-pressed="isReadableTextMode"
          @click="toggleReadableTextMode"
        >
          大字模式：{{ isReadableTextMode ? '開' : '關' }}
        </button>
      </div>
    </nav>

    <main class="relative flex flex-1 flex-col">
      <router-view />
    </main>

    <footer class="border-t border-slate-800 bg-slate-900 pb-8 pt-16">
      <div class="mx-auto mb-12 flex max-w-7xl flex-col items-center justify-between gap-8 px-6 md:flex-row md:px-12">
        <div class="flex items-center gap-4">
          <div class="flex h-16 w-16 items-center justify-center">
            <img src="/logo.jpg" alt="中港熊戰社區棒球 Logo" class="h-full w-full object-contain" />
          </div>
          <div>
            <h2 class="text-2xl font-black uppercase tracking-widest text-primary">中港熊戰社區棒球</h2>
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
        <p>&copy; 2026 中港熊戰社區棒球. Designed for excellence. All rights reserved.</p>
      </div>
    </footer>

    <LoginModal v-model="showLogin" />
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Close, Menu } from '@element-plus/icons-vue'

import HolidayThemeRibbon from '@/components/layout/HolidayThemeRibbon.vue'
import LoginModal from '@/components/LoginModal.vue'
import { useReadableTextMode } from '@/composables/useReadableTextMode'
import { useVersionCheck } from '@/composables/useVersionCheck'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()
const showLogin = ref(false)
const isMobileMenuOpen = ref(false)
const { hasUpdateAvailable, isApplyingUpdate, refreshApp } = useVersionCheck()
const { isReadableTextMode, toggleReadableTextMode } = useReadableTextMode()

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
  isMobileMenuOpen.value = false
  if (router.currentRoute.value.path === '/dashboard') return
  void router.push('/dashboard')
}

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false
}

const triggerJoinModal = () => {
  isMobileMenuOpen.value = false

  if (router.currentRoute.value.path !== '/') {
    router.push('/').then(() => {
      setTimeout(() => window.dispatchEvent(new CustomEvent('openJoinModal')), 200)
    })
  } else {
    window.dispatchEvent(new CustomEvent('openJoinModal'))
  }
}

const scrollElementIntoView = (sectionId: string) => {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const scrollToSection = async (sectionId: string) => {
  isMobileMenuOpen.value = false
  await nextTick()

  if (router.currentRoute.value.path !== '/') {
    router.push('/').then(() => {
      setTimeout(() => {
        scrollElementIntoView(sectionId)
        window.setTimeout(() => scrollElementIntoView(sectionId), 900)
      }, 200)
    })
  } else {
    scrollElementIntoView(sectionId)
    window.setTimeout(() => scrollElementIntoView(sectionId), 900)
  }
}

const scrollToSchedule = () => {
  scrollToSection('schedule')
}

const scrollToAnnouncements = () => {
  scrollToSection('announcements')
}
</script>

<style scoped>
.animate-fade-in-down {
  animation: fadeInDown 0.3s ease-out;
  transform-origin: top;
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
