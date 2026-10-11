import { watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'

const pendingLoads = new Map<string, Promise<void>>()

export const useAppRoleNames = () => {
  const authStore = useAuthStore()
  const permissionsStore = usePermissionsStore()

  watch(
    () => authStore.isAuthenticated && authStore.user?.id === authStore.profile?.id
      ? authStore.user?.id
      : undefined,
    (userId) => {
      if (!userId || permissionsStore.roles.length > 0 || pendingLoads.has(userId)) return

      const pending = permissionsStore.fetchRoles().finally(() => pendingLoads.delete(userId))
      pendingLoads.set(userId, pending)
    },
    { immediate: true }
  )
}
