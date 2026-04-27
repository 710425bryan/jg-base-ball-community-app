<script setup lang="ts">
import { onMounted } from 'vue'
import HolidayThemeSiteEffects from '@/components/layout/HolidayThemeSiteEffects.vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(async () => {
  await authStore.ensureInitialized()
})
</script>

<template>
  <div v-if="authStore.isInitializing" class="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center">
    <div class="animate-pulse flex flex-col items-center">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-gray-500 font-bold tracking-widest">系統初始化中...</p>
    </div>
  </div>
  <template v-else>
    <HolidayThemeSiteEffects />
    <router-view />
  </template>
</template>
