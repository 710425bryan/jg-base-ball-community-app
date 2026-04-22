<template>
  <div class="min-h-screen bg-background flex items-center justify-center px-6">
    <div class="flex flex-col items-center text-center">
      <div class="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-gray-500 font-bold tracking-widest">通知載入中...</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
