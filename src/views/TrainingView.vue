<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import TrainingWorkspace from '@/components/training/TrainingWorkspace.vue'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'

const router = useRouter()
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const canViewTraining = computed(() =>
  authStore.isAuthenticated &&
  !permissionsStore.isLoading &&
  permissionsStore.currentRole === authStore.profile?.role &&
  permissionsStore.can('training', 'VIEW')
)
const workspaceKey = computed(() => JSON.stringify([
  authStore.profile?.id,
  authStore.profile?.role,
  authStore.profile?.linked_team_member_ids || []
]))

// Destroy the workspace on revocation so pending responses cannot restore its UI.
watch([canViewTraining, () => permissionsStore.isLoading], ([allowed, isLoading]) => {
  if (!allowed && !isLoading) void router.replace('/dashboard')
}, { immediate: true })
</script>

<template>
  <TrainingWorkspace v-if="canViewTraining" :key="workspaceKey" />
</template>
