<template>
  <div class="h-screen bg-background text-text flex flex-col relative w-full overflow-hidden">
    <!-- Topbar -->
    <header class="h-16 bg-white/95 backdrop-blur-md text-text sticky top-0 z-50 border-b border-gray-200 pt-[env(safe-area-inset-top)] shadow-sm">
      <div class="h-full flex items-center px-4 max-w-7xl mx-auto w-full">
        <!-- Left: Logo -->
        <div class="font-extrabold text-xl tracking-wider text-primary flex items-center gap-2 shrink-0 md:w-56 drop-shadow-[0_0_8px_rgba(216,143,34,0.4)]">
          <img src="/少棒元素_20260324_232837_0000.png" alt="Logo" class="w-8 h-8 rounded-full border border-gray-200 object-cover" />
          中港熊戰棒球隊
        </div>

        <!-- Center: Desktop Menu -->
        <div class="flex-1 flex justify-center">
          <nav class="hidden md:flex space-x-8 nav-desktop">
            <router-link to="/dashboard" class="hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">後台大廳</router-link>
            <router-link to="/calendar" class="hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">行事曆</router-link>
            <router-link to="/leave-requests" class="hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">請假系統</router-link>
            <router-link to="/players" class="hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">球員名單</router-link>
            <router-link to="/users" class="hover:text-primary transition-colors font-bold text-gray-600 uppercase tracking-wide">設定</router-link>
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
              <div v-for="note in notifications" :key="note.id" class="p-3 px-4 border-b border-gray-50 hover:bg-primary/5 transition-colors cursor-pointer text-sm">
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
          <div class="hidden md:flex flex-col items-end justify-center mr-2">
            <span class="text-sm font-extrabold text-gray-800 leading-tight">{{ authStore.profile?.name || '使用者' }}</span>
            <span class="text-xs text-primary font-bold">{{ translateRole(authStore.profile?.role) }}</span>
          </div>

          <!-- Desktop Sign Out -->
          <button @click="handleSignOut" class="hidden md:flex items-center gap-1.5 text-gray-400 hover:text-red-500 font-bold transition-colors text-sm px-3 py-1.5 rounded-lg hover:bg-red-50">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            登出
          </button>
          
          <!-- Mobile Hamburger -->
          <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="p-1 md:hidden text-gray-600 hover:text-primary transition-colors focus:outline-none rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Mobile Hamburger Menu (Dropdown/Overlay) -->
    <div v-if="isMobileMenuOpen" class="md:hidden absolute top-16 left-0 w-full bg-white border-b border-gray-100 z-40 mt-[env(safe-area-inset-top)] shadow-xl animate-fade-in-down">
      <nav class="flex flex-col py-2">
         <router-link to="/dashboard" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">後台大廳</router-link>
         <router-link to="/calendar" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">行事曆</router-link>
         <router-link to="/leave-requests" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">請假系統</router-link>
         <router-link to="/players" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">球員名單</router-link>
         <router-link to="/users" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-gray-600 hover:bg-gray-50 font-bold tracking-wide">設定</router-link>
         <button @click="handleSignOut" class="text-left px-6 py-5 text-red-500 hover:bg-red-50 font-bold w-full transition-colors flex items-center gap-2 uppercase tracking-widest text-sm">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
           登出系統
         </button>
      </nav>
    </div>

    <!-- Main Content Area -->
    <main class="flex-1 relative flex flex-col bg-background overflow-hidden w-full">
      <router-view />
    </main>

    <!-- Bottom Menu (Mobile Only) -->
    <nav class="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 flex justify-around items-center z-50 text-xs text-gray-500 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pt-2 h-auto min-h-[4.5rem]">
      <router-link to="/dashboard" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span class="font-bold tracking-wide">大廳</span>
      </router-link>
      <router-link to="/calendar" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span class="font-bold tracking-wide">行事曆</span>
      </router-link>
      <router-link to="/leave-requests" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        <span class="font-bold tracking-wide">請假</span>
      </router-link>
      <router-link to="/players" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span class="font-bold tracking-wide">球員</span>
      </router-link>
      <router-link to="/users" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
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
import { Bell } from '@element-plus/icons-vue';
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-tw'

dayjs.extend(relativeTime)
dayjs.locale('zh-tw')

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
  router.push('/login');
};

// --- 推播通知機制 (Web Notification + Supabase Realtime) ---
let realtimeChannel: any = null;

const startListening = () => {
  if (realtimeChannel) return;

  realtimeChannel = supabase
    .channel('leave-requests-inserts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'leave_requests' },
      async (payload) => {
        // Fetch specific player name immediately to update UI Notification Bell Array
        const { data } = await supabase.from('team_members').select('name').eq('id', payload.new.user_id).single();
        const newNote = {
          id: payload.new.id,
          title: `[新增假單] ${data?.name || '未知成員'} 的${payload.new.leave_type || '假單'}`,
          body: `日期：${payload.new.start_date} ~ ${payload.new.end_date}`,
          created_at: payload.new.created_at
        };
        notifications.value.unshift(newNote);

        if (Notification.permission === 'granted') {
          // 如果是自己送的假單，不必通知自己 (若 user_id 能對應回去)
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
    .subscribe();
};

const stopListening = () => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
};

const fetchInitialNotifications = async () => {
  const { data } = await supabase.from('leave_requests')
    .select('id, leave_type, start_date, end_date, reason, created_at, team_members(name)')
    .order('created_at', { ascending: false })
    .limit(8);
  if (data) {
    notifications.value = data.map(r => ({
      id: r.id,
      title: `[新增假單] ${(r.team_members as any)?.name || '未知球員'} 的${r.leave_type}`,
      body: `日期：${r.start_date} ~ ${r.end_date}\n原因：${r.reason || '無'}`,
      created_at: r.created_at
    }))
  }
}

// 監聽權限變化，只有教練以上級別才會收到通知
watch(() => authStore.profile?.role, (newRole) => {
  if (newRole === 'ADMIN' || newRole === 'MANAGER' || newRole === 'HEAD_COACH') {
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
</style>
