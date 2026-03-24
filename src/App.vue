<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(async () => {
  await authStore.initializeAuth()
})
</script>

<template>
  <div v-if="authStore.isInitializing" class="min-h-screen bg-background flex flex-col items-center justify-center safe-area-padding">
    <div class="animate-pulse flex flex-col items-center">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-text-muted font-medium">系統初始化中...</p>
    </div>
  </div>
  <router-view v-else />
</template>
