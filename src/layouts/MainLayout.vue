<template>
  <div class="fixed inset-0 bg-background text-text flex flex-col w-full overflow-hidden">
    <!-- Topbar -->
    <header class="flex-none h-16 bg-white/95 backdrop-blur-md text-text border-b border-gray-200 pt-[env(safe-area-inset-top)] shadow-sm z-50">
      <div class="h-full flex items-center px-4 max-w-7xl mx-auto w-full">
        <!-- Left: Logo -->
        <div 
          @click="router.push('/')"
          class="font-extrabold text-xl tracking-wider text-primary flex items-center gap-2 shrink-0 md:w-56 drop-shadow-[0_0_8px_rgba(216,143,34,0.4)] cursor-pointer hover:opacity-80 transition-opacity"
          title="回首頁"
        >
          <img src="/少棒元素_20260324_232837_0000.png" alt="Logo" class="w-8 h-8 object-contain" />
          中港熊戰棒球隊
        </div>

        <!-- Center: Desktop Menu -->
        <div class="flex-1 flex justify-center mx-2 overflow-hidden">
          <nav class="hidden lg:flex gap-5 xl:gap-8 nav-desktop items-center px-1">
            <router-link to="/dashboard" class="whitespace-nowrap text-[13px] lg:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">後台大廳</router-link>
            <router-link to="/calendar" class="whitespace-nowrap text-[13px] lg:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">行事曆</router-link>
            <router-link to="/match-records" class="whitespace-nowrap text-[13px] lg:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">比賽紀錄</router-link>
            <router-link v-if="['ADMIN', 'MANAGER', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role)" to="/leave-requests" class="whitespace-nowrap text-[13px] lg:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">請假系統</router-link>
            <router-link v-if="['ADMIN', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role)" to="/attendance" class="whitespace-nowrap text-[13px] lg:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">點名系統</router-link>
            <router-link v-if="['ADMIN', 'MANAGER'].includes(authStore.profile?.role)" to="/players" class="whitespace-nowrap text-[13px] lg:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">球員名單</router-link>
            
            <!-- 更多選單 (不常用收納區) -->
            <el-dropdown trigger="hover" placement="bottom" v-if="['ADMIN', 'MANAGER'].includes(authStore.profile?.role)">
              <div class="cursor-pointer whitespace-nowrap text-[13px] lg:text-base hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1 pt-0.5 outline-none">
                更多 <el-icon class="text-xs transition-transform duration-300 el-dropdown-link-icon"><ArrowDown /></el-icon>
              </div>
              <template #dropdown>
                <el-dropdown-menu class="!p-1.5 !rounded-xl min-w-[140px] shadow-xl border-gray-100">
                  <el-dropdown-item @click="router.push('/join-inquiries')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">入隊申請</el-dropdown-item>
                  <el-dropdown-item @click="router.push('/announcements')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">系統公告</el-dropdown-item>
                  <el-dropdown-item v-if="authStore.profile?.role === 'ADMIN'" @click="router.push('/fees')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5">收費管理</el-dropdown-item>
                  <el-dropdown-item @click="router.push('/users')" class="!rounded-lg !font-bold !text-gray-600 hover:!text-primary !py-2.5" divided>設定</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </nav>
        </div>

        <!-- Right: Actions -->
        <div class="shrink-0 flex items-center justify-end md:w-auto gap-4">
          
          <!-- Notification Bell -->
          <el-popover placement="bottom-end" :width="320" trigger="click" :show-arrow="false" popper-style="padding: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);">
            <template #reference>
              <button class="relative p-2 text-gray-400 hover:text-primary transition-colors focus:outline-none rounded-full hover:bg-gray-50 flex items-center justify-center">
                <el-icon class="text-[22px]"><Bell /></el-icon>
                <span v-if="notifications.length > 0" class="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white"></span>
              </button>
            </template>
            <div class="bg-gray-50 border-b border-gray-100 p-3 px-4 flex justify-between items-center">
              <h3 class="font-bold text-gray-800 text-sm">系統通知中心</h3>
              <span class="bg-primary/10 text-primary text-[10px] font-extrabold px-2 py-0.5 rounded-full">{{ notifications.length }} 則新通知</span>
            </div>
            <div v-if="notifications.length > 0" class="max-h-[350px] overflow-y-auto bg-white">
              <div v-for="note in notifications" :key="note.id" @click="router.push(note.link || '/')" class="p-3 px-4 border-b border-gray-50 hover:bg-primary/5 transition-colors cursor-pointer text-sm">
                <div class="text-gray-800 font-bold mb-1 line-clamp-1 leading-snug">{{ note.title }}</div>
                <div class="text-gray-500 text-xs mb-1.5 leading-snug">{{ note.body }}</div>
                <div class="text-gray-400 text-[10px] flex justify-end">{{ dayjs(note.created_at).fromNow() }}</div>
              </div>
            </div>
            <div v-else class="text-sm text-gray-400 text-center py-8 bg-white flex flex-col items-center">
              <el-icon class="text-4xl text-gray-200 mb-2"><Bell /></el-icon>
              目前沒有新通知
            </div>
          </el-popover>

          <!-- User Profile (Desktop Only) -->
          <div class="hidden md:flex flex-col items-end justify-center mr-2 lg:mr-4">
            <span class="text-sm font-extrabold text-gray-800 leading-tight">{{ authStore.profile?.name || '使用者' }}</span>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="text-[10px] text-gray-500 font-bold bg-gray-100/80 px-1.5 py-0.5 rounded border border-gray-200 leading-none" title="系統版本">v{{ appVersion }}</span>
              <span class="text-xs text-primary font-bold">{{ translateRole(authStore.profile?.role) }}</span>
            </div>
          </div>

          <!-- Desktop Sign Out -->
          <button @click="handleSignOut" class="hidden lg:flex items-center gap-1.5 text-gray-400 hover:text-red-500 font-bold transition-colors text-sm px-3 py-1.5 rounded-lg hover:bg-red-50">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            登出
          </button>
          
          <!-- Mobile Hamburger -->
          <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="p-1 lg:hidden text-gray-600 hover:text-primary transition-colors focus:outline-none rounded-lg ml-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Mobile Hamburger Menu (Dropdown/Overlay) -->
    <div v-if="isMobileMenuOpen" class="lg:hidden absolute top-16 left-0 w-full max-h-[calc(100vh-4rem)] overflow-y-auto bg-white border-b border-gray-100 z-40 shadow-xl animate-fade-in-down">
      <nav class="flex flex-col py-2">
         <!-- Mobile User Info & Version -->
         <div class="px-6 pb-4 pt-2 border-b border-gray-100 flex items-center justify-between mb-1 bg-gray-50/30">
           <div class="flex flex-col">
             <span class="text-sm font-extrabold text-gray-800">{{ authStore.profile?.name || '使用者' }}</span>
             <span class="text-xs text-primary font-bold mt-0.5">{{ translateRole(authStore.profile?.role) }}</span>
           </div>
           <span class="text-[10px] text-gray-500 font-bold bg-white px-2 py-1 rounded-md border border-gray-200 shadow-sm tracking-wide">v{{ appVersion }}</span>
         </div>
         <router-link to="/dashboard" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">後台大廳</router-link>
         <router-link to="/calendar" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">行事曆</router-link>
         <router-link to="/match-records" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">比賽紀錄</router-link>
         <router-link v-if="['ADMIN', 'MANAGER', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role)" to="/leave-requests" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">請假系統</router-link>
         <router-link v-if="['ADMIN', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role)" to="/attendance" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">點名系統</router-link>
         <router-link v-if="['ADMIN', 'MANAGER'].includes(authStore.profile?.role)" to="/players" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">球員名單</router-link>
         <router-link v-if="['ADMIN', 'MANAGER'].includes(authStore.profile?.role)" to="/join-inquiries" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">入隊申請</router-link>
         <router-link v-if="['ADMIN', 'MANAGER'].includes(authStore.profile?.role)" to="/announcements" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">系統公告</router-link>
         <router-link v-if="['ADMIN'].includes(authStore.profile?.role)" to="/fees" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">收費管理</router-link>
         <router-link v-if="['ADMIN', 'MANAGER'].includes(authStore.profile?.role)" to="/users" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">設定</router-link>
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
    <nav class="md:hidden flex-none w-full bg-white border-t border-gray-200 flex justify-around items-center z-50 text-xs text-gray-500 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pt-2 h-[4.5rem]">
      <router-link to="/dashboard" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0 h-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span class="font-bold tracking-wide">大廳</span>
      </router-link>
      <router-link to="/calendar" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0 h-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span class="font-bold tracking-wide">行事曆</span>
      </router-link>
      <router-link to="/match-records" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0 h-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
        <span class="font-bold tracking-wide">紀錄</span>
      </router-link>
      <router-link v-if="['ADMIN', 'MANAGER', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role)" to="/leave-requests" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0 h-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        <span class="font-bold tracking-wide">請假</span>
      </router-link>
      <router-link v-if="['ADMIN', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role)" to="/attendance" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0 h-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="font-bold tracking-wide">點名</span>
      </router-link>
      <router-link v-if="['ADMIN', 'MANAGER'].includes(authStore.profile?.role)" to="/players" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0 h-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span class="font-bold tracking-wide">球員</span>
      </router-link>
      <router-link v-if="['ADMIN', 'MANAGER'].includes(authStore.profile?.role)" to="/users" class="flex flex-col items-center justify-center p-1 px-2 min-w-[3.5rem] hover:text-primary transition-colors shrink-0 h-full">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="font-bold tracking-wide">設定</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/services/supabase';
import { Bell, ArrowDown } from '@element-plus/icons-vue';
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'
import pkg from '../../package.json'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

const appVersion = pkg.version;

const router = useRouter();
const authStore = useAuthStore();
const isMobileMenuOpen = ref(false);
const notifications = ref<any[]>([]);

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

// --- 推播通知機制 (Web Notification + Supabase Realtime) ---
let realtimeChannel: any = null;
let teamMemberChannel: any = null;
let joinInquiriesChannel: any = null;
let quarterlyFeesChannel: any = null;

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
        if (!['ADMIN', 'MANAGER', 'HEAD_COACH', 'COACH'].includes(authStore.profile?.role)) return;

        const { data } = await supabase.from('team_members').select('name').eq('id', payload.new.user_id).single();
        const newNote = {
          id: payload.new.id,
          title: `[新增假單] ${data?.name || '未知成員'} 的${payload.new.leave_type || '假單'}`,
          body: `日期：${payload.new.start_date} ~ ${payload.new.end_date}`,
          created_at: payload.new.created_at,
          link: '/leave-requests'
        };
        notifications.value.unshift(newNote);

        if (Notification.permission === 'granted') {
          if (payload.new.user_id === authStore.user?.id) return;
          const note = new Notification('收到新的系統通知', {
            body: newNote.title,
            icon: '/少棒元素_20260324_232837_0000.png'
          });
          note.onclick = () => {
            window.focus();
            router.push('/leave-requests');
            note.close();
          };
        }
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
        if (!['ADMIN', 'MANAGER'].includes(authStore.profile?.role)) return;

        console.log('⚡ [Realtime 攔截] 收到 team_members 最新資料！Payload:', payload);

        const newNote = {
          id: payload.new.id,
          title: `[新進通知] 歡迎 ${payload.new.name} 入隊！`,
          body: `剛從表單收到了 ${payload.new.name} (${payload.new.role}) 的球員資料。`,
          created_at: payload.new.created_at || new Date().toISOString(),
          link: '/players'
        };
        notifications.value.unshift(newNote);

        if (Notification.permission === 'granted') {
          console.log('[推播觸發] Notification.permission 是 granted, 準備彈出橫幅...');
          const note = new Notification('收到新球員名單', {
            body: newNote.title,
            icon: '/少棒元素_20260324_232837_0000.png'
          });
          console.log('[推播觸發] 橫幅呼叫完成！', note);
          note.onclick = () => {
            window.focus();
            router.push('/players');
            note.close();
          };
        } else {
          console.log('[推播阻擋] 雖然收到了 Socket 更新，但目前權限狀態是：', Notification.permission);
        }
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
          if (!['ADMIN', 'MANAGER'].includes(authStore.profile?.role)) return;

          console.log('⚡ [Realtime 攔截] 收到 join_inquiries 最新資料！Payload:', payload);

          const newNote = {
            id: payload.new.id,
            title: `[入隊詢問] 收到來自 ${payload.new.parent_name} 的聯絡`,
            body: `電話: ${payload.new.phone}。請盡快與家長聯繫！`,
            created_at: payload.new.created_at || new Date().toISOString(),
            link: '/join-inquiries'
          };
          notifications.value.unshift(newNote);

          if (Notification.permission === 'granted') {
            const note = new Notification('收到新的入隊詢問', {
              body: newNote.title,
              icon: '/少棒元素_20260324_232837_0000.png'
            });
            note.onclick = () => {
              window.focus();
              router.push('/join-inquiries');
              note.close();
            };
          }
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
      async (payload) => {
        // 限 ADMIN, MANAGER 接收
        if (!['ADMIN', 'MANAGER'].includes(authStore.profile?.role)) return;

        const { data } = await supabase.from('team_members').select('name').eq('id', payload.new.member_id).single();

        const newNote = {
          id: payload.new.id,
          title: `[新增季費] 收到 ${data?.name || '未知球員'} 的繳費登記`,
          body: `季度: ${payload.new.year_quarter} | 方式: ${payload.new.payment_method} | 金額: $${payload.new.amount}`,
          created_at: payload.new.created_at || new Date().toISOString(),
          link: '/fees'
        };
        notifications.value.unshift(newNote);

        if (Notification.permission === 'granted') {
          const note = new Notification('季費登記通知', {
            body: newNote.title,
            icon: '/少棒元素_20260324_232837_0000.png'
          });
          note.onclick = () => {
            window.focus();
            router.push('/fees');
            note.close();
          };
        }
      }
    )
    .subscribe((status) => {
      console.log('📡 [WebSocket] 季費表單連線狀態：', status);
    });
};

const stopListening = () => {
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

const fetchInitialNotifications = async () => {
  const role = authStore.profile?.role
  if (!role) return

  const promises = []

  // 1. 請假系統 (ADMIN, MANAGER, HEAD_COACH, COACH)
  if (['ADMIN', 'MANAGER', 'HEAD_COACH', 'COACH'].includes(role)) {
    promises.push(
      supabase.from('leave_requests')
        .select('id, leave_type, start_date, end_date, reason, created_at, team_members(name)')
        .order('created_at', { ascending: false })
        .limit(8)
        .then(res => ({ type: 'leave', data: res.data }))
    )
  }

  // 2. 限管理員層級接收的通知 (ADMIN, MANAGER)
  if (['ADMIN', 'MANAGER'].includes(role)) {
    // 球員異動
    promises.push(
      supabase.from('team_members')
        .select('id, name, role, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
        .then(res => ({ type: 'member', data: res.data }))
    )
    // 入隊申請
    promises.push(
      supabase.from('join_inquiries')
        .select('id, parent_name, phone, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
        .then(res => ({ type: 'join', data: res.data }))
    )
    // 季費表單 (為了避免關聯名稱抓取失敗，我們獨立抓取名字)
    promises.push(
      supabase.from('quarterly_fees')
        .select('id, member_id, year_quarter, payment_method, amount, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
        .then(async (res) => {
           if (res.data) {
             // 補上名稱對應
             const mIds = [...new Set(res.data.map(f => f.member_id))]
             const { data: mData } = await supabase.from('team_members').select('id, name').in('id', mIds)
             const nameMap = (mData || []).reduce((acc: any, cur: any) => ({ ...acc, [cur.id]: cur.name }), {})
             res.data.forEach((f: any) => { f.memberName = nameMap[f.member_id] || '未知球員' })
           }
           return { type: 'fee', data: res.data }
        })
    )
  }

  const results = await Promise.all(promises)
  const combined: any[] = []

  results.forEach(res => {
    if (res.type === 'leave' && res.data) {
      combined.push(...res.data.map((r: any) => ({
        id: r.id,
        title: `[新增假單] ${(r.team_members as any)?.name || '未知球員'} 的${r.leave_type}`,
        body: `日期：${r.start_date} ~ ${r.end_date}\n原因：${r.reason || '無'}`,
        created_at: r.created_at,
        link: '/leave-requests'
      })))
    } else if (res.type === 'member' && res.data) {
      combined.push(...res.data.map((m: any) => ({
        id: m.id,
        title: `[新進通知] 歡迎 ${m.name} 入隊！`,
        body: `剛從表單收到了 ${m.name} (${translateRole(m.role)}) 的球員資料。`,
        created_at: m.created_at,
        link: '/players'
      })))
    } else if (res.type === 'join' && res.data) {
      combined.push(...res.data.map((j: any) => ({
        id: j.id,
        title: `[入隊詢問] 收到來自 ${j.parent_name} 的聯絡`,
        body: `電話: ${j.phone}。請盡快與家長聯繫！`,
        created_at: j.created_at,
        link: '/join-inquiries'
      })))
    } else if (res.type === 'fee' && res.data) {
      combined.push(...res.data.map((f: any) => ({
        id: f.id,
        title: `[新增季費] 收到 ${f.memberName} 的繳費登記`,
        body: `季度: ${f.year_quarter} | 方式: ${f.payment_method} | 金額: $${f.amount}`,
        created_at: f.created_at,
        link: '/fees'
      })))
    }
  })

  combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  notifications.value = combined.slice(0, 10)
}

// 監聽權限變化，確保有權限的角色才會開啟 WebSocket
watch(() => authStore.profile?.role, (newRole) => {
  if (newRole === 'ADMIN' || newRole === 'MANAGER' || newRole === 'HEAD_COACH' || newRole === 'COACH') {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    startListening();
  } else {
    stopListening();
  }
}, { immediate: true });

onUnmounted(() => {
  stopListening();
});

onMounted(() => {
  if (authStore.profile?.role === 'ADMIN' || authStore.profile?.role === 'MANAGER' || authStore.profile?.role === 'HEAD_COACH' || authStore.profile?.role === 'COACH') {
    fetchInitialNotifications()
  }
})
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
