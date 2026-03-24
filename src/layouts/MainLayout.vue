<template>
  <div class="min-h-screen bg-background text-text flex flex-col relative w-full h-full">
    <!-- Topbar -->
    <header class="h-14 bg-white text-text sticky top-0 z-50 shadow-sm border-b border-gray-100 pt-[env(safe-area-inset-top)]">
      <div class="h-full flex items-center px-4 max-w-7xl mx-auto w-full">
        <!-- Left: Logo -->
        <div class="font-extrabold text-xl tracking-wide text-primary flex items-center gap-2 shrink-0 md:w-48">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="white"/>
            <path d="M7.5 12c0-1.5.5-2.8 1.3-3.9M16.5 12c0-1.5-.5-2.8-1.3-3.9" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          中港熊戰棒球隊
        </div>

        <!-- Center: Desktop Menu -->
        <div class="flex-1 flex justify-center">
          <nav class="hidden md:flex space-x-8">
            <router-link to="/home" class="hover:text-primary transition-colors font-medium text-gray-600">首頁</router-link>
            <router-link to="/calendar" class="hover:text-primary transition-colors font-medium text-gray-600">行事曆</router-link>
            <router-link to="/leave-requests" class="hover:text-primary transition-colors font-medium text-gray-600">請假系統</router-link>
            <router-link to="/players" class="hover:text-primary transition-colors font-medium text-gray-600">球員名單</router-link>
            <router-link to="/users" class="hover:text-primary transition-colors font-medium text-gray-600">使用者</router-link>
          </nav>
        </div>

        <!-- Right: Actions -->
        <div class="shrink-0 flex items-center justify-end md:w-48">
          <!-- Desktop Sign Out -->
          <button @click="handleSignOut" class="hidden md:flex items-center gap-1.5 text-gray-400 hover:text-red-500 font-bold transition-colors text-sm px-3 py-1.5 rounded-lg hover:bg-red-50">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            登出
          </button>
          
          <!-- Mobile Hamburger -->
          <button @click="isMobileMenuOpen = !isMobileMenuOpen" class="p-1 md:hidden text-gray-600 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Mobile Hamburger Menu (Dropdown/Overlay) -->
    <div v-if="isMobileMenuOpen" class="md:hidden absolute top-14 left-0 w-full bg-white shadow-lg border-t border-gray-100 z-40 mt-[env(safe-area-inset-top)] animate-fade-in-down">
      <nav class="flex flex-col py-2">
         <router-link to="/home" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium">首頁</router-link>
         <router-link to="/calendar" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium">行事曆</router-link>
         <router-link to="/leave-requests" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium">請假系統</router-link>
         <router-link to="/players" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium">球員名單</router-link>
         <router-link to="/users" @click="isMobileMenuOpen = false" class="px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium">使用者列表</router-link>
         <button @click="handleSignOut" class="text-left px-6 py-4 text-red-500 hover:bg-red-50 font-bold w-full transition-colors flex items-center gap-2">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
           登出系統
         </button>
      </nav>
    </div>

    <!-- Main Content Area -->
    <main class="flex-1 overflow-y-auto pb-20 md:pb-6 p-4 relative flex flex-col">
      <router-view />
    </main>

    <!-- Bottom Menu (Mobile Only) -->
    <nav class="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 flex justify-around items-center z-50 text-xs text-text-muted pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pt-2 h-auto min-h-[4rem]">
      <router-link to="/home" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <span class="font-medium">首頁</span>
      </router-link>
      <router-link to="/calendar" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span class="font-medium">行事曆</span>
      </router-link>
      <router-link to="/leave-requests" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
        <span class="font-medium">請假</span>
      </router-link>
      <router-link to="/players" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <span class="font-medium">球員</span>
      </router-link>
      <router-link to="/users" class="flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span class="font-medium">設定</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { supabase } from '@/services/supabase';

const router = useRouter();
const authStore = useAuthStore();
const isMobileMenuOpen = ref(false);

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
        if (Notification.permission === 'granted') {
          // 如果是自己送的假單，不必通知自己
          if (payload.new.user_id === authStore.user?.id) return;

          const { data } = await supabase.from('profiles').select('name').eq('id', payload.new.user_id).single();
          new Notification('收到新的請假單', {
            body: `${data?.name || '未知成員'} 送出了「${payload.new.leave_type}」`,
            icon: '/pwa-192x192.png'
          });
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
  color: var(--color-primary);
}
.router-link-active svg {
  stroke: var(--color-primary);
}

/* Desktop Menu Active Style */
header nav .router-link-active {
  color: var(--color-primary);
  border-bottom: 2px solid var(--color-primary);
  padding-bottom: 2px;
}
</style>
