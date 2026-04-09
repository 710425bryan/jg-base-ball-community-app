<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useVersionCheck } from '@/composables/useVersionCheck'

const authStore = useAuthStore()
const { hasUpdateAvailable, refreshApp } = useVersionCheck()

onMounted(async () => {
  await authStore.initializeAuth()
})
</script>

<template>
  <div v-if="authStore.isInitializing" class="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center">
    <div class="animate-pulse flex flex-col items-center">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-gray-500 font-bold tracking-widest">系統初始化中...</p>
    </div>
  </div>
  <router-view v-else />
</template>
