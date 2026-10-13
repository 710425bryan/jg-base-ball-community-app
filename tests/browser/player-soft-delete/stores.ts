import { defineStore } from 'pinia'

export const useAuthStore = defineStore('player-soft-delete-auth-fixture', {
  state: () => ({ user: { id: 'fixture-editor' }, profile: { id: 'fixture-editor', role: 'ADMIN' } })
})
export const usePermissionsStore = defineStore('player-soft-delete-permissions-fixture', {
  state: () => ({ denied: [] as string[], roles: [{ role_key: 'ADMIN', role_name: '管理員', weight: 1 }] }),
  actions: {
    can(feature: string, action: string) { return !this.denied.includes(`${feature}:${action}`) }
  }
})
