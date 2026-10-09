import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/services/supabase'
import { sortUserRoles } from '@/utils/userRoleOrder'

export const usePermissionsStore = defineStore('permissions', () => {
  const permissions = ref<any[]>([])
  const roles = ref<any[]>([])
  const isLoading = ref(false)
  const currentRole = ref<string>('')
  let permissionsRequestId = 0

  const fetchPermissions = async (roleKey: string) => {
    const requestId = ++permissionsRequestId
    isLoading.value = true
    currentRole.value = roleKey

    try {
      if (!roleKey) {
        permissions.value = []
        return
      }
      
      const { data, error } = await supabase
        .from('app_role_permissions')
        .select('feature, action')
        .eq('role_key', roleKey)
      
      if (error) throw error
      if (requestId !== permissionsRequestId) return
      permissions.value = data || []
    } catch (err) {
      if (requestId !== permissionsRequestId) return
      console.error('Failed to fetch permissions', err)
      permissions.value = []
    } finally {
      if (requestId === permissionsRequestId) isLoading.value = false
    }
  }

  const fetchRoles = async () => {
    try {
      const { data, error } = await supabase
        .from('app_roles')
        .select('*')
        .order('weight', { ascending: true })
      
      if (error) throw error
      roles.value = sortUserRoles(data || [])
    } catch (err) {
      console.error('Failed to fetch roles', err)
    }
  }

  const can = (feature: string, action: string = 'VIEW') => {
    if (currentRole.value === 'ADMIN') return true // ADMIN bypasses all permission checks

    if (action === 'VIEW' && (feature === 'dashboard' || feature === 'calendar' || feature === 'matches')) {
      return true // 預設開放功能
    }

    return permissions.value.some(p => p.feature === feature && p.action === action)
  }

  return {
    permissions,
    roles,
    isLoading,
    currentRole,
    fetchPermissions,
    fetchRoles,
    can
  }
})
