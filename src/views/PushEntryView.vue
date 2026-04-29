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
