<script setup lang="ts">
import { onMounted } from 'vue'
import HolidayThemeSiteEffects from '@/components/layout/HolidayThemeSiteEffects.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

onMounted(async () => {
  await authStore.ensureInitialized()
})
</script>

<template>
  <AppLoadingState v-if="authStore.isInitializing" text="系統初始化中..." fixed />
  <template v-else>
    <HolidayThemeSiteEffects />
    <router-view />
  </template>
</template>
