<template>
  <div class="fixed inset-0 bg-background text-text flex flex-col w-full overflow-hidden">
    <!-- Topbar -->
    <header class="flex-none bg-white/95 backdrop-blur-md text-text border-b border-gray-200 pt-[env(safe-area-inset-top)] shadow-sm z-50" style="background-color: var(--color-header-surface);">
      <div class="h-16 flex items-center gap-2 px-3 sm:px-4 max-w-7xl mx-auto w-full">
        <!-- Left: Logo -->
        <div 
          @click="router.push('/')"
          class="font-extrabold text-base tracking-wide text-primary flex items-center gap-1.5 shrink-0 min-w-0 sm:gap-2 sm:text-xl sm:tracking-wider lg:w-44 xl:w-52 drop-shadow-[0_0_8px_rgba(216,143,34,0.4)] cursor-pointer hover:opacity-80 transition-opacity"
          title="回首頁"
        >
          <img src="/少棒元素_20260324_232837_0000.png" alt="Logo" class="h-7 w-7 object-contain sm:h-8 sm:w-8" />
          <span class="truncate">中港熊戰棒球隊</span>
        </div>

        <!-- Center: Desktop Menu -->
        <div class="flex-1 min-w-0 flex justify-center mx-1 xl:mx-2 overflow-hidden">
          <nav class="hidden lg:flex gap-4 xl:gap-6 2xl:gap-8 nav-desktop items-center px-1 min-w-0">
            <router-link to="/dashboard" class="whitespace-nowrap text-[13px] xl:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">後台大廳</router-link>
            <router-link to="/calendar" class="whitespace-nowrap text-[13px] xl:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">行事曆</router-link>
            <router-link v-if="permissionsStore.can('matches', 'VIEW')" to="/match-records" class="whitespace-nowrap text-[13px] xl:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">比賽紀錄</router-link>
            <router-link v-if="permissionsStore.can('leave_requests', 'VIEW')" to="/leave-requests" class="whitespace-nowrap text-[13px] xl:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">請假系統</router-link>
            <router-link v-if="permissionsStore.can('attendance', 'VIEW')" to="/attendance" class="whitespace-nowrap text-[13px] xl:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">點名系統</router-link>
            <router-link v-if="permissionsStore.can('players', 'VIEW')" to="/players" class="whitespace-nowrap text-[13px] xl:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">球員名單</router-link>
            
            <!-- 更多選單 (不常用收納區) -->
            <el-dropdown trigger="hover" placement="bottom" v-if="permissionsStore.can('join_inquiries') || permissionsStore.can('announcements') || permissionsStore.can('fees') || permissionsStore.can('equipment') || permissionsStore.can('users')">
              <div class="cursor-pointer whitespace-nowrap text-[13px] xl:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1 pt-0.5 outline-none">
                更多 <el-icon class="text-xs transition-transform duration-300 el-dropdown-link-icon"><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu class="!p-1.5 !rounded-xl min-w-[140px] shadow-xl border-gray-100">
                  <el-dropdown-item v-if="permissionsStore.can('join_inquiries', 'VIEW')" @click="router.push('/join-inquiries')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">入隊申請</el-dropdown-item>
                  <el-dropdown-item v-if="permissionsStore.can('announcements', 'VIEW')" @click="router.push('/announcements')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">系統公告</el-dropdown-item>
                  <el-dropdown-item v-if="permissionsStore.can('fees', 'VIEW')" @click="router.push('/fees')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">收費管理</el-dropdown-item>
                  <el-dropdown-item v-if="permissionsStore.can('equipment', 'VIEW')" @click="router.push('/equipment')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">裝備管理</el-dropdown-item>
                  <el-dropdown-item v-if="permissionsStore.can('users', 'VIEW')" @click="router.push('/users')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5" divided>使用者名單</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </nav>
        </div>

        <!-- Right: Actions -->
        <div class="shrink-0 flex items-center justify-end md:w-auto gap-2 sm:gap-3">
          
          <!-- Notification Bell -->
          <el-popover ref="notificationPopover" placement="bottom-end" :width="320" trigger="click" :show-arrow="false" popper-style="padding: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);">
            <template #reference>
              <button @click="handleNotificationBellClick" class="relative flex items-center justify-center rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-50 hover:text-primary focus:outline-none sm:p-2">
                <el-icon class="text-[22px]"><Bell /></el-icon>
                <span v-if="notifications.length > 0" class="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white"></span>
              </button>
            </template>
            <div class="bg-gray-50 border-b border-gray-100 p-3 px-4 flex justify-between items-center">
              <h3 class="font-bold text-gray-800 text-sm">系統通知中心</h3>
              <span class="bg-primary/10 text-primary text-[10px] font-extrabold px-2 py-0.5 rounded-full">{{ notifications.length }} 則新通知</span>
            </div>
            <div v-if="notifications.length > 0" class="max-h-[350px] overflow-y-auto bg-white">
              <div v-for="note in notifications" :key="note.id" @click="handleNotificationClick(note.link)" class="p-3 px-4 border-b border-gray-50 hover:bg-primary/5 transition-colors cursor-pointer text-sm">
                <div class="text-gray-800 font-bold mb-1 line-clamp-1 leading-snug">{{ note.title }}</div>
                <div class="text-gray-500 text-xs mb-1.5 leading-snug">{{ note.body }}</div>
                <div class="text-gray-400 text-[10px] flex justify-end">{{ dayjs(note.createdAt).fromNow() }}</div>
              </div>
            </div>
            <div v-else-if="isNotificationFeedLoading" class="text-sm text-gray-400 text-center py-8 bg-white flex flex-col items-center">
              <el-icon class="text-4xl text-gray-200 mb-2"><Bell /></el-icon>
              通知載入中...
            </div>
            <div v-else class="text-sm text-gray-400 text-center py-8 bg-white flex flex-col items-center">
              <el-icon class="text-4xl text-gray-200 mb-2"><Bell /></el-icon>
              目前沒有新通知
            </div>
          </el-popover>

          <!-- User Profile (Desktop Only) -->
          <div class="hidden md:block">
            <el-dropdown trigger="hover" placement="bottom-end">
              <button type="button" class="flex items-center gap-3 min-w-0 rounded-2xl px-2 py-1.5 hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 rounded-full overflow-hidden border border-gray-200 bg-gray-50 shrink-0">
                  <img v-if="authStore.profile?.avatar_url" :src="authStore.profile.avatar_url" class="w-full h-full object-cover" alt="使用者大頭照" />
                  <div v-else class="w-full h-full flex items-center justify-center text-sm font-black text-gray-400">
                    {{ currentUserDisplayName.charAt(0) }}
                  </div>
                </div>
                <div class="flex flex-col items-end justify-center min-w-0">
                  <span class="text-sm font-extrabold text-gray-800 leading-tight truncate max-w-[9rem]">{{ currentUserDisplayName }}</span>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span class="text-[10px] text-gray-500 font-bold bg-gray-100/80 px-1.5 py-0.5 rounded border border-gray-200 leading-none" title="系統版本">v{{ appVersion }}</span>
                    <span class="text-xs text-primary font-bold truncate max-w-[6rem]">{{ translateRole(authStore.profile?.role) }}</span>
                  </div>
                </div>
                <el-icon class="text-gray-400 shrink-0"><ArrowDown /></el-icon>
              </button>
              <template #dropdown>
                <el-dropdown-menu class="!p-1.5 !rounded-xl min-w-[180px] shadow-xl border-gray-100">
                  <el-dropdown-item @click="router.push('/profile')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">個人設定</el-dropdown-item>
                  <el-dropdown-item @click="router.push('/my-payments')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">繳費資訊</el-dropdown-item>
                  <el-dropdown-item v-if="hasLinkedTeamMembers" @click="router.push('/equipment-addons')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">裝備加購</el-dropdown-item>
                  <el-dropdown-item @click="router.push('/my-leave-requests')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">我的假單</el-dropdown-item>
                  <el-dropdown-item v-if="permissionsStore.can('leave_requests', 'VIEW')" @click="openPushSettingsFromMenu" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">通知設定</el-dropdown-item>
                  <el-dropdown-item @click="handleSignOut" class="!rounded-lg !font-bold !text-red-500 hover:!text-red-600 !py-2.5" divided>登出</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          
          <!-- Mobile Hamburger -->
          <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="ml-1 rounded-lg p-1 text-gray-600 transition-colors hover:text-primary focus:outline-none lg:hidden sm:ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- 系統更新提示列 (登入後專屬，接績在 Topbar 下方) -->
    <div v-if="hasUpdateAvailable" 
         @click="refreshApp" 
         class="flex-none h-11 overflow-hidden bg-[#D88F22] hover:bg-[#b87a1d] text-white text-xs sm:text-sm font-bold px-3 text-center flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm animate-fade-in-down relative z-[45]"
         title="點擊以重新載入系統獲取最新功能">
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 sm:h-5 sm:w-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span class="truncate">系統已發布新版本，點擊重新整理以取得最新功能</span>
    </div>

    <!-- Mobile Hamburger Menu (Dropdown/Overlay) -->
    <div
      v-if="isMobileMenuOpen"
      class="lg:hidden absolute left-0 w-full overflow-y-auto bg-white border-b border-gray-100 z-40 shadow-xl animate-fade-in-down"
      :style="mobileMenuStyle"
    >
      <nav class="flex flex-col py-2">
         <!-- Mobile User Info & Version -->
         <div class="px-6 pb-4 pt-2 border-b border-gray-100 flex items-center justify-between mb-1 bg-gray-50/30 gap-3">
           <div class="flex items-center gap-3 min-w-0">
             <div class="w-11 h-11 rounded-full overflow-hidden border border-gray-200 bg-white shadow-sm shrink-0">
               <img v-if="authStore.profile?.avatar_url" :src="authStore.profile.avatar_url" class="w-full h-full object-cover" alt="使用者大頭照" />
               <div v-else class="w-full h-full flex items-center justify-center text-sm font-black text-gray-400">
                 {{ currentUserDisplayName.charAt(0) }}
               </div>
             </div>
             <div class="flex flex-col min-w-0">
               <span class="text-sm font-extrabold text-gray-800 truncate">{{ currentUserDisplayName }}</span>
               <span class="text-xs text-primary font-bold mt-0.5">{{ translateRole(authStore.profile?.role) }}</span>
             </div>
           </div>
           <span class="text-[10px] text-gray-500 font-bold bg-white px-2 py-1 rounded-md border border-gray-200 shadow-sm tracking-wide">v{{ appVersion }}</span>
         </div>
         <router-link to="/profile" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">個人設定</router-link>
         <router-link to="/my-payments" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">繳費資訊</router-link>
         <router-link v-if="hasLinkedTeamMembers" to="/equipment-addons" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">裝備加購</router-link>
         <router-link to="/my-leave-requests" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">我的假單</router-link>
         <button v-if="permissionsStore.can('leave_requests', 'VIEW')" @click="openPushSettingsFromMenu" class="text-left px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide w-full transition-colors">通知設定</button>
         <router-link to="/dashboard" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">後台大廳</router-link>
         <router-link to="/calendar" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">行事曆</router-link>
         <router-link v-if="permissionsStore.can('matches', 'VIEW')" to="/match-records" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">比賽紀錄</router-link>
         <router-link v-if="permissionsStore.can('leave_requests', 'VIEW')" to="/leave-requests" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">請假系統</router-link>
         <router-link v-if="permissionsStore.can('attendance', 'VIEW')" to="/attendance" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">點名系統</router-link>
         <router-link v-if="permissionsStore.can('players', 'VIEW')" to="/players" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">球員名單</router-link>
         <router-link v-if="permissionsStore.can('join_inquiries', 'VIEW')" to="/join-inquiries" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">入隊申請</router-link>
         <router-link v-if="permissionsStore.can('announcements', 'VIEW')" to="/announcements" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">系統公告</router-link>
         <router-link v-if="permissionsStore.can('fees', 'VIEW')" to="/fees" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">收費管理</router-link>
         <router-link v-if="permissionsStore.can('equipment', 'VIEW')" to="/equipment" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">裝備管理</router-link>
         <router-link v-if="permissionsStore.can('users', 'VIEW')" to="/users" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">使用者名單</router-link>
         <button @click="handleSignOut" class="text-left px-6 py-5 text-red-500 hover:bg-red-50 font-bold w-full transition-colors flex items-center gap-2 uppercase tracking-widest text-sm">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
           登出系統
         </button>
      </nav>
    </div>

    <!-- Main Content Area -->
    <main class="flex-1 min-h-0 relative flex flex-col bg-background overflow-y-auto w-full">
      <router-view />
    </main>

    <!-- Bottom Menu (Mobile Only) -->
    <nav class="md:hidden flex-none w-full bg-white border-t border-gray-200 z-50 text-xs text-gray-500 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
      <div class="flex justify-around items-center pt-2 h-[4.5rem]">
      <router-link to="/dashboard" @click="isMobileMenuOpen = false" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span class="font-bold tracking-wide">大廳</span>
      </router-link>
      <router-link to="/calendar" @click="isMobileMenuOpen = false" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span class="font-bold tracking-wide">行事曆</span>
      </router-link>
      <router-link v-if="permissionsStore.can('matches', 'VIEW')" to="/match-records" @click="isMobileMenuOpen = false" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        <span class="font-bold tracking-wide">比賽紀錄</span>
      </router-link>
      <router-link v-if="permissionsStore.can('players', 'VIEW')" to="/players" @click="isMobileMenuOpen = false" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span class="font-bold tracking-wide">球員</span>
      </router-link>
      <router-link v-if="permissionsStore.can('fees', 'VIEW')" to="/fees" @click="isMobileMenuOpen = false" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-2.21 0-4 .895-4 2s1.79 2 4 2 4 .895 4 2-1.79 2-4 2m0-10c1.742 0 3.224.554 3.775 1.333M12 8V6m0 2v2m0 4v2m0-2c-1.742 0-3.224-.554-3.775-1.333M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="font-bold tracking-wide">收費管理</span>
      </router-link>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { usePermissionsStore } from '@/stores/permissions';
import { supabase } from '@/services/supabase';
import { Bell, ArrowDown } from '@element-plus/icons-vue';
import { configureNotificationFeedFallbackFetcher, useNotificationFeed } from '@/composables/useNotificationFeed';
import { useVersionCheck } from '@/composables/useVersionCheck';
import { buildNotificationFeedItemId, type NotificationFeedItem, type NotificationFeedRow } from '@/types/dashboard';
import { buildSiblingGroupMap, normalizeSiblingIds } from '@/utils/siblingGroups'
import {
  buildGroupedPushEventKey,
  buildPushEventKey,
  dispatchPushNotification
} from '@/utils/pushNotifications'
import {
  groupQuarterlyFeeRecordsByPayment,
  selectLatestQuarterlyRecord,
  sumQuarterlyFeeGroupAmount
} from '@/utils/quarterlyFeeFamilies'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const appVersion = __APP_VERSION__;

const router = useRouter();
const authStore = useAuthStore();
const permissionsStore = usePermissionsStore();
const {
  notifications,
  isLoading: isNotificationFeedLoading,
  loadNotificationFeed,
  upsertNotification,
  resetNotificationFeed
} = useNotificationFeed();
const { hasUpdateAvailable, refreshApp } = useVersionCheck();
const isMobileMenuOpen = ref(false);
const notificationPopover = ref<any>(null);
const currentUserDisplayName = computed(() => authStore.profile?.nickname || authStore.profile?.name || '使用者');
const hasLinkedTeamMembers = computed(() => {
  const linkedIds = authStore.profile?.linked_team_member_ids
  return Array.isArray(linkedIds) && linkedIds.length > 0
});
const mobileMenuStyle = computed(() => {
  const updateBarOffset = hasUpdateAvailable.value ? ' - 2.75rem' : ''
  const updateBarTopOffset = hasUpdateAvailable.value ? ' + 2.75rem' : ''

  return {
    top: `calc(4rem + env(safe-area-inset-top)${updateBarTopOffset})`,
    maxHeight: `calc(100dvh - 4rem${updateBarOffset} - env(safe-area-inset-top) - 4.5rem - env(safe-area-inset-bottom))`
  }
});

const handleNotificationClick = (link: string | undefined) => {
  if (link) {
    router.push(link);
  } else {
    router.push('/');
  }
  // 自動收起推播選單
  notificationPopover.value?.hide();
};

const handleNotificationBellClick = () => {
  void loadNotificationFeedSafely();
};

const translateRole = (role: string | undefined) => {
  const map: Record<string, string> = {
    'ADMIN': '系統管理員',
    'MANAGER': '管理員',
    'HEAD_COACH': '總教練',
    'COACH': '教練',
    'MEMBER': '球員',
    'PARENT': '家長'
  }
  return role ? map[role] || role : '未知權限'
}

const handleSignOut = async () => {
  isMobileMenuOpen.value = false;
  await authStore.signOut();
  router.push('/');
};

const openPushSettingsFromMenu = () => {
  isMobileMenuOpen.value = false;
  void router.push({
    path: '/leave-requests',
    query: {
      open_push_settings: '1'
    }
  });
};

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
}

type IdleCapableWindow = Window & typeof globalThis & {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: { timeout: number }
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
}

let notificationIdleHandle: number | null = null;
let notificationDelayHandle: number | null = null;

const loadNotificationFeedSafely = async () => {
  try {
    await loadNotificationFeed(10);
  } catch (error) {
    console.error('Error fetching notification feed:', error);
  }
};

const scheduleNotificationFeedLoad = () => {
  if (!authStore.profile?.role || typeof window === 'undefined') return;

  const idleWindow = window as IdleCapableWindow;

  if (typeof idleWindow.requestIdleCallback === 'function') {
    notificationIdleHandle = idleWindow.requestIdleCallback(() => {
      void loadNotificationFeedSafely();
    }, { timeout: 1200 });
    return;
  }

  notificationDelayHandle = window.setTimeout(() => {
    void loadNotificationFeedSafely();
  }, 800);
};

const clearScheduledNotificationFeedLoad = () => {
  if (typeof window === 'undefined') return;

  const idleWindow = window as IdleCapableWindow;

  if (notificationIdleHandle !== null && typeof idleWindow.cancelIdleCallback === 'function') {
    idleWindow.cancelIdleCallback(notificationIdleHandle);
    notificationIdleHandle = null;
  }

  if (notificationDelayHandle !== null) {
    window.clearTimeout(notificationDelayHandle);
    notificationDelayHandle = null;
  }
};

const maybeShowBrowserNotification = (
  title: string,
  body: string,
  onClick: () => void
) => {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }

  const notification = new Notification(title, {
    body,
    icon: '/少棒元素_20260324_232837_0000.png'
  });

  notification.onclick = () => {
    window.focus();
    onClick();
    notification.close();
  };
};

const normalizeQuarterlyMembers = (members: any[]) =>
  normalizeSiblingIds(
    members.map((member) => ({
      ...member,
      sibling_ids: Array.isArray(member.sibling_ids) ? [...member.sibling_ids] : []
    }))
  )

const fetchQuarterlyRelatedMembers = async (memberIds: string[]) => {
  const uniqueIds = [...new Set(memberIds)].filter(Boolean)
  if (uniqueIds.length === 0) {
    return []
  }

  const { data: directMembers, error: directMembersError } = await supabase
    .from('team_members')
    .select('id, name, role, sibling_ids')
    .in('id', uniqueIds)

  if (directMembersError) throw directMembersError

  const additionalSiblingIds = [...new Set(
    (directMembers || []).flatMap((member: any) => Array.isArray(member.sibling_ids) ? member.sibling_ids : [])
  )]
    .filter((id) => !uniqueIds.includes(id))

  if (additionalSiblingIds.length === 0) {
    return directMembers || []
  }

  const { data: siblingMembers, error: siblingMembersError } = await supabase
    .from('team_members')
    .select('id, name, role, sibling_ids')
    .in('id', additionalSiblingIds)

  if (siblingMembersError) throw siblingMembersError

  return [...(directMembers || []), ...(siblingMembers || [])]
}

const buildQuarterlyFeeNotificationGroups = (records: any[], members: any[]) => {
  const normalizedMembers = normalizeQuarterlyMembers(members)
  const siblingGroupMap = buildSiblingGroupMap(normalizedMembers)
  const nameMap = new Map(normalizedMembers.map((member) => [member.id, member.name]))
  const roleMap = new Map(normalizedMembers.map((member) => [member.id, member.role]))

  return groupQuarterlyFeeRecordsByPayment(records, siblingGroupMap)
    .map((group) => {
      const latestRecord = selectLatestQuarterlyRecord(group.records)
      const highlightMemberId = group.linkedMemberIds[0] || latestRecord?.member_id || null
      const memberNames = group.linkedMemberIds.map((id) => nameMap.get(id)).filter(Boolean)
      const roleName = highlightMemberId ? roleMap.get(highlightMemberId) || '球員' : '球員'

      return {
        id: String(latestRecord?.id || group.groupKey),
        year_quarter: latestRecord?.year_quarter || '-',
        payment_method: latestRecord?.payment_method || '-',
        amount: sumQuarterlyFeeGroupAmount(group.records),
        created_at: latestRecord?.created_at || new Date().toISOString(),
        highlightMemberId,
        memberName: memberNames.length > 0 ? memberNames.join(', ') : '未知球員',
        isSchoolTeam: roleName === '校隊'
      }
    })
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
}

const buildQuarterlyFeeNotificationLink = (fee: {
  id: string
  isSchoolTeam: boolean
  highlightMemberId: string | null
}) => `/fees?tab=${fee.isSchoolTeam ? 'monthly' : 'quarterly'}&highlight_fee_id=${fee.id}&highlight_member_id=${fee.highlightMemberId || ''}`

const buildQuarterlyFeeNotificationBody = (fee: {
  year_quarter: string
  payment_method: string
  amount: number
}) => `季度: ${fee.year_quarter} | 方式: ${fee.payment_method} | 金額: $${fee.amount}`

const buildRealtimeQuarterlyFeeBufferKey = (record: any) => JSON.stringify({
  yearQuarter: record.year_quarter || '',
  memberIds: [...new Set((Array.isArray(record.member_ids) && record.member_ids.length > 0
    ? record.member_ids
    : record.member_id
      ? [record.member_id]
      : []
  ).filter(Boolean))].sort((left, right) => String(left).localeCompare(String(right))),
  status: record.status || '',
  paymentMethod: record.payment_method || '',
  remittanceDate: record.remittance_date || '',
  accountLast5: record.account_last_5 || '',
  paymentItems: Array.from(new Set<string>(
    (record.payment_items || []).filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
  )).sort((left, right) => left.localeCompare(right)),
  otherItemNote: record.other_item_note || ''
})

const fetchNotificationFeedLegacy = async (limit: number): Promise<NotificationFeedRow[]> => {
  const role = authStore.profile?.role
  if (!role) return []

  const promises: Array<PromiseLike<{ type: 'leave' | 'member' | 'join' | 'fee'; data: any[] | null | undefined }>> = []

  if (permissionsStore.can('leave_requests', 'VIEW')) {
    promises.push(
      supabase.from('leave_requests')
        .select('id, leave_type, start_date, end_date, reason, created_at, team_members(name)')
        .order('created_at', { ascending: false })
        .limit(Math.max(limit, 8))
        .then((res) => {
          if (res.error) throw res.error
          return { type: 'leave' as const, data: res.data }
        })
    )
  }

  if (permissionsStore.can('players', 'VIEW')) {
    promises.push(
      supabase.from('team_members')
        .select('id, name, role, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.max(limit, 5))
        .then((res) => {
          if (res.error) throw res.error
          return { type: 'member' as const, data: res.data }
        })
    )
  }

  if (permissionsStore.can('join_inquiries', 'VIEW')) {
    promises.push(
      supabase.from('join_inquiries')
        .select('id, parent_name, phone, created_at')
        .order('created_at', { ascending: false })
        .limit(Math.max(limit, 5))
        .then((res) => {
          if (res.error) throw res.error
          return { type: 'join' as const, data: res.data }
        })
    )
  }

  if (permissionsStore.can('fees', 'VIEW')) {
    promises.push(
      supabase.from('quarterly_fees')
        .select('id, member_id, member_ids, year_quarter, payment_method, amount, created_at, status, remittance_date, account_last_5, payment_items, other_item_note')
        .order('created_at', { ascending: false })
        .limit(Math.max(limit, 12))
        .then(async (res) => {
          if (res.error) throw res.error

          if (res.data) {
            const uniqueIds = [...new Set(
              res.data.flatMap((fee: any) =>
                Array.isArray(fee.member_ids) && fee.member_ids.length > 0
                  ? fee.member_ids
                  : fee.member_id
                    ? [fee.member_id]
                    : []
              )
            )].filter(Boolean)

            const membersData = uniqueIds.length > 0
              ? await fetchQuarterlyRelatedMembers(uniqueIds)
              : []

            return {
              type: 'fee' as const,
              data: buildQuarterlyFeeNotificationGroups(res.data, membersData)
            }
          }

          return { type: 'fee' as const, data: [] }
        })
    )
  }

  const results = await Promise.all(promises)
  const combined: NotificationFeedRow[] = []

  results.forEach((result) => {
    if (result.type === 'leave' && result.data) {
      combined.push(...result.data.map((row: any) => ({
        id: String(row.id),
        source: 'leave' as const,
        title: `[新增假單] ${row.team_members?.name || '未知球員'} 的${row.leave_type}`,
        body: `日期：${row.start_date} ~ ${row.end_date}\n原因：${row.reason || '無'}`,
        created_at: row.created_at,
        link: `/leave-requests?highlight_leave_id=${row.id}`,
        highlight_member_id: null
      })))
    } else if (result.type === 'member' && result.data) {
      combined.push(...result.data.map((member: any) => ({
        id: String(member.id),
        source: 'member' as const,
        title: `[新進通知] 歡迎 ${member.name} 入隊！`,
        body: `剛從表單收到了 ${member.name} (${translateRole(member.role)}) 的球員資料。`,
        created_at: member.created_at,
        link: '/players',
        highlight_member_id: null
      })))
    } else if (result.type === 'join' && result.data) {
      combined.push(...result.data.map((join: any) => ({
        id: String(join.id),
        source: 'join' as const,
        title: `[入隊詢問] 收到來自 ${join.parent_name} 的聯絡`,
        body: `電話: ${join.phone}。請盡快與家長聯繫！`,
        created_at: join.created_at,
        link: '/join-inquiries',
        highlight_member_id: null
      })))
    } else if (result.type === 'fee' && result.data) {
      combined.push(...result.data.map((fee: any) => ({
        id: String(fee.id),
        source: 'fee' as const,
        title: `[新增匯款] 收到 ${fee.memberName} 的繳費登記`,
        body: buildQuarterlyFeeNotificationBody(fee),
        created_at: fee.created_at,
        link: buildQuarterlyFeeNotificationLink(fee),
        highlight_member_id: fee.highlightMemberId || null
      })))
    }
  })

  return combined
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, limit)
};

configureNotificationFeedFallbackFetcher(fetchNotificationFeedLegacy);

// --- 推播通知機制 (Web Notification + Supabase Realtime) ---
let realtimeChannel: any = null;
let teamMemberChannel: any = null;
let joinInquiriesChannel: any = null;
let quarterlyFeesChannel: any = null;
const quarterlyFeeNotificationBuffer = new Map<string, any[]>();
const quarterlyFeeNotificationBufferTimers = new Map<string, number>();

const clearQuarterlyFeeNotificationBuffer = () => {
  quarterlyFeeNotificationBufferTimers.forEach((timerId) => {
    window.clearTimeout(timerId);
  });
  quarterlyFeeNotificationBufferTimers.clear();
  quarterlyFeeNotificationBuffer.clear();
};

const flushQuarterlyFeeNotificationBuffer = async (bufferKey: string) => {
  const bufferedRecords = quarterlyFeeNotificationBuffer.get(bufferKey) || [];
  quarterlyFeeNotificationBuffer.delete(bufferKey);

  const timerId = quarterlyFeeNotificationBufferTimers.get(bufferKey);
  if (timerId) {
    window.clearTimeout(timerId);
    quarterlyFeeNotificationBufferTimers.delete(bufferKey);
  }

  if (bufferedRecords.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(
    bufferedRecords.flatMap((record: any) =>
      Array.isArray(record.member_ids) && record.member_ids.length > 0
        ? record.member_ids
        : record.member_id
          ? [record.member_id]
          : []
    )
  )].filter(Boolean);

  const membersData = uniqueIds.length > 0
    ? await fetchQuarterlyRelatedMembers(uniqueIds)
    : [];

  const groupedFees = buildQuarterlyFeeNotificationGroups(bufferedRecords, membersData);
  const groupedFee = groupedFees[0];
  if (!groupedFee) {
    return;
  }

  const newNoteLink = buildQuarterlyFeeNotificationLink(groupedFee);
  const newNote: NotificationFeedItem = {
    id: buildNotificationFeedItemId('fee', String(groupedFee.id)),
    source: 'fee',
    title: `[新增匯款] 收到 ${groupedFee.memberName} 的繳費登記`,
    body: buildQuarterlyFeeNotificationBody(groupedFee),
    createdAt: groupedFee.created_at || new Date().toISOString(),
    link: newNoteLink,
    highlightMemberId: groupedFee.highlightMemberId || null
  };

  upsertNotification(newNote);

  maybeShowBrowserNotification(newNote.title, newNote.body, () => {
    router.push(newNoteLink);
  });

  void dispatchPushNotification({
    title: newNote.title,
    body: newNote.body,
    url: newNoteLink,
    feature: 'fees',
    action: 'VIEW',
    eventKey: buildGroupedPushEventKey(
      'quarterly_fee',
      bufferedRecords.map((record: any) => record.id || bufferKey)
    )
  }).catch((error) => {
    console.warn('季費推播傳送失敗', error)
  });
};

const queueQuarterlyFeeNotification = (record: any) => {
  const bufferKey = buildRealtimeQuarterlyFeeBufferKey(record);
  const bufferedRecords = quarterlyFeeNotificationBuffer.get(bufferKey) || [];
  bufferedRecords.push(record);
  quarterlyFeeNotificationBuffer.set(bufferKey, bufferedRecords);

  const existingTimerId = quarterlyFeeNotificationBufferTimers.get(bufferKey);
  if (existingTimerId) {
    window.clearTimeout(existingTimerId);
  }

  const nextTimerId = window.setTimeout(() => {
    void flushQuarterlyFeeNotificationBuffer(bufferKey);
  }, 450);

  quarterlyFeeNotificationBufferTimers.set(bufferKey, nextTimerId);
};

const startListening = () => {
  if (realtimeChannel || teamMemberChannel || joinInquiriesChannel) return;

  // 1. 監聽請假表單 (專屬跑道A)
  realtimeChannel = supabase
    .channel('leave-requests-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'leave_requests' },
      async (payload) => {
        // 限 ADMIN, MANAGER, HEAD_COACH, COACH 接收:
        if (!permissionsStore.can('leave_requests', 'VIEW')) return;

        const { data } = await supabase.from('team_members').select('name').eq('id', payload.new.user_id).single();
        const newNote: NotificationFeedItem = {
          id: buildNotificationFeedItemId('leave', String(payload.new.id)),
          source: 'leave',
          title: `[新增假單] ${data?.name || '未知成員'} 的${payload.new.leave_type || '假單'}`,
          body: `日期：${payload.new.start_date} ~ ${payload.new.end_date}`,
          createdAt: payload.new.created_at || new Date().toISOString(),
          link: `/leave-requests?highlight_leave_id=${payload.new.id}`,
          highlightMemberId: null
        };
        upsertNotification(newNote);

        if (payload.new.user_id === authStore.user?.id) {
          return;
        }

        maybeShowBrowserNotification('收到新的系統通知', newNote.title, () => {
          router.push(`/leave-requests?highlight_leave_id=${payload.new.id}`);
        });
      }
    )
    .subscribe((status, err) => {
      console.log('📡 [WebSocket] 請假系統連線狀態：', status);
    });

  // 2. 監聽新進球員 (專屬跑道B)
  teamMemberChannel = supabase
    .channel('team-members-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'team_members' },
      (payload) => {
        // 限 ADMIN, MANAGER 接收:
        if (!permissionsStore.can('players', 'VIEW')) return;

        console.log('⚡ [Realtime 攔截] 收到 team_members 最新資料！Payload:', payload);

        const newNote: NotificationFeedItem = {
          id: buildNotificationFeedItemId('member', String(payload.new.id)),
          source: 'member',
          title: `[新進通知] 歡迎 ${payload.new.name} 入隊！`,
          body: `剛從表單收到了 ${payload.new.name} (${payload.new.role}) 的球員資料。`,
          createdAt: payload.new.created_at || new Date().toISOString(),
          link: '/players',
          highlightMemberId: null
        };
        upsertNotification(newNote);

        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          console.log('[推播觸發] Notification.permission 是 granted, 準備彈出橫幅...');
          maybeShowBrowserNotification('收到新球員名單', newNote.title, () => {
            router.push('/players');
          });
        } else if (typeof Notification !== 'undefined') {
          console.log('[推播阻擋] 雖然收到了 Socket 更新，但目前權限狀態是：', Notification.permission);
        }

        void dispatchPushNotification({
          title: newNote.title,
          body: newNote.body,
          url: '/players',
          feature: 'players',
          action: 'VIEW',
          eventKey: buildPushEventKey('team_member', payload.new.id)
        }).catch((error) => {
          console.warn('球員通知推播傳送失敗', error)
        });
      }
    )
    .subscribe((status, err) => {
      console.log('📡 [WebSocket] 球員名單通道連線狀態：', status);
      if (status === 'SUBSCRIBED') {
        console.log('✅ [WebSocket] 球員資料接收器啟動成功！');
      }
    });

  // 3. 監聽詢問加入表單 (專屬跑道C)
  joinInquiriesChannel = supabase
    .channel('join-inquiries-channel')
    .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'join_inquiries' },
        (payload) => {
          // 只推播給管理員
          if (!permissionsStore.can('join_inquiries', 'VIEW')) return;

          console.log('⚡ [Realtime 攔截] 收到 join_inquiries 最新資料！Payload:', payload);

          const newNote: NotificationFeedItem = {
            id: buildNotificationFeedItemId('join', String(payload.new.id)),
            source: 'join',
            title: `[入隊詢問] 收到來自 ${payload.new.parent_name} 的聯絡`,
            body: `電話: ${payload.new.phone}。請盡快與家長聯繫！`,
            createdAt: payload.new.created_at || new Date().toISOString(),
            link: '/join-inquiries',
            highlightMemberId: null
          };
          upsertNotification(newNote);

          maybeShowBrowserNotification('收到新的入隊詢問', newNote.title, () => {
            router.push('/join-inquiries');
          });

          void dispatchPushNotification({
            title: newNote.title,
            body: newNote.body,
            url: '/join-inquiries',
            feature: 'join_inquiries',
            action: 'VIEW',
            eventKey: buildPushEventKey('join_inquiry', payload.new.id)
          }).catch((error) => {
            console.warn('入隊詢問推播傳送失敗', error)
          });
        }
    )
    .subscribe((status) => {
      console.log('📡 [WebSocket] 入隊詢問表單連線狀態：', status);
    });

  // 4. 監聽季費表單 (專屬跑道D)
  quarterlyFeesChannel = supabase
    .channel('quarterly-fees-channel')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'quarterly_fees' },
      (payload) => {
        // 限 ADMIN, MANAGER 接收
        if (!permissionsStore.can('fees', 'VIEW')) return;
        queueQuarterlyFeeNotification(payload.new);
      }
    )
    .subscribe((status) => {
      console.log('📡 [WebSocket] 季費表單連線狀態：', status);
    });
};

const stopListening = () => {
  clearQuarterlyFeeNotificationBuffer();
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (teamMemberChannel) {
    supabase.removeChannel(teamMemberChannel);
    teamMemberChannel = null;
  }
  if (joinInquiriesChannel) {
    supabase.removeChannel(joinInquiriesChannel);
    joinInquiriesChannel = null;
  }
  if (quarterlyFeesChannel) {
    supabase.removeChannel(quarterlyFeesChannel);
    quarterlyFeesChannel = null;
  }
};

// 監聽權限變化，確保有權限的角色才會開啟 WebSocket
watch(() => authStore.profile?.role, (newRole) => {
  if (!newRole) {
    clearScheduledNotificationFeedLoad();
    stopListening();
    resetNotificationFeed();
    return;
  }

  startListening();
  clearScheduledNotificationFeedLoad();
  scheduleNotificationFeedLoad();
}, { immediate: true });


onUnmounted(() => {
  clearScheduledNotificationFeedLoad();
  clearQuarterlyFeeNotificationBuffer();
  stopListening();
  resetNotificationFeed();
  configureNotificationFeedFallbackFetcher(null);
});

</script>

<style scoped>
/* Mobile Menu Dropdown Animation */
.animate-fade-in-down {
  animation: fadeInDown 0.3s ease-out;
  transform-origin: top;
}
@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Mobile Menu Active Style */
.router-link-active {
  color: #D88F22;
}
.router-link-active svg {
  stroke: #D88F22;
}

/* Desktop Menu Active Style */
header nav.nav-desktop .router-link-active {
  color: #D88F22;
  border-bottom: 2px solid #D88F22;
  padding-bottom: 2px;
  text-shadow: 0 0 10px rgba(216,143,34,0.4);
}

.el-dropdown-link-icon {
  margin-left: 2px;
}
.el-dropdown:hover .el-dropdown-link-icon {
  transform: rotate(180deg);
}

/* Hide scrollbar for overflowing nav */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;  /* Firefox */
}
</style>
