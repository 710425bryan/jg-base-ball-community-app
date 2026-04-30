<template>
  <AppLoadingState text="通知載入中..." screen />
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { useAuthStore } from '@/stores/auth'
import { normalizePushDeepLinkTarget } from '@/utils/pushDeepLink'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const targetPath = computed(() => normalizePushDeepLinkTarget(route.query.target))

onMounted(async () => {
  await authStore.ensureInitialized()

  if (!authStore.isAuthenticated) {
    await router.replace('/')
    return
  }

  await router.replace(targetPath.value)
})
</script>
