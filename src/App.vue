<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import HolidayThemeSiteEffects from '@/components/layout/HolidayThemeSiteEffects.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { useAuthStore } from '@/stores/auth'
import { useReadableTextMode } from '@/composables/useReadableTextMode'
import { withUnsavedChangesNavigationBypass } from '@/composables/useUnsavedChangesGuard'
import AuthAccessNotice from '@/components/AuthAccessNotice.vue'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()
const { initializeReadableTextMode } = useReadableTextMode()

watch(
  () => [authStore.isInitializing, authStore.isAuthenticated, authStore.accessDeniedMessage, route.meta.requiresAuth],
  () => {
    if (!authStore.isInitializing && !authStore.isAuthenticated && route.meta.requiresAuth) {
      // A revoked account cannot keep the protected route open with a draft.
      void withUnsavedChangesNavigationBypass(() => router.replace('/'))
    }
  },
  { flush: 'post' }
)

onMounted(async () => {
  initializeReadableTextMode()
  await authStore.ensureInitialized()
})
</script>

<template>
  <AppLoadingState v-if="authStore.isInitializing" text="系統初始化中..." fixed />
  <AuthAccessNotice v-else-if="authStore.accessDeniedMessage" :message="authStore.accessDeniedMessage" @dismiss="authStore.accessDeniedMessage = ''" />
  <template v-else>
    <HolidayThemeSiteEffects />
    <router-view v-if="!route.meta.requiresAuth || authStore.isAuthenticated" />
  </template>
</template>
