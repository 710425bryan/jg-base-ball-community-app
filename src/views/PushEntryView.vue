<template>
  <AppLoadingState text="通知載入中..." screen />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const normalizeTargetPath = (rawTarget: unknown) => {
  if (typeof rawTarget !== 'string') {
    return '/dashboard'
  }

  const trimmedTarget = rawTarget.trim()

  if (!trimmedTarget || !trimmedTarget.startsWith('/') || trimmedTarget.startsWith('//')) {
    return '/dashboard'
  }

  if (trimmedTarget.startsWith('/push-entry')) {
    return '/dashboard'
  }

  try {
    const targetUrl = new URL(trimmedTarget, window.location.origin)
    if (targetUrl.origin === window.location.origin && targetUrl.pathname === '/match-records') {
      const matchId = targetUrl.searchParams.get('match_id')?.trim()
      if (matchId) {
        return `/calendar?match_id=${encodeURIComponent(matchId)}`
      }
    }
  } catch {
    // Keep the original target if it is not parseable as a URL.
  }

  return trimmedTarget
}

const targetPath = computed(() => normalizeTargetPath(route.query.target))

onMounted(async () => {
  await authStore.ensureInitialized()

  if (!authStore.isAuthenticated) {
    await router.replace('/')
    return
  }

  await router.replace(targetPath.value)
})
</script>
