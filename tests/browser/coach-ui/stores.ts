import { defineStore } from 'pinia'

export const useAuthStore = defineStore('coach-ui-auth-fixture', {
  state: () => ({
    user: { id: 'coach-a' },
    profile: { id: 'coach-a', role: 'COACH', name: '王文豪', nickname: null,
      is_active: true, access_start: null, access_end: null, linked_team_member_ids: [] }
  })
})
export const usePermissionsStore = defineStore('coach-ui-permissions-fixture', {
  state: () => ({
    currentRole: 'COACH', denied: [] as string[],
    roles: [
      { role_key: 'COACH', role_name: '教練', weight: 20 },
      { role_key: 'ADMIN', role_name: '管理員', weight: 1 },
      { role_key: 'HEAD_COACH', role_name: '總教練', weight: 10 }
    ]
  }),
  actions: {
    can(feature: string, action: string) { return !this.denied.includes(`${feature}:${action}`) },
    async fetchRoles() { /* Keep the fixture's latest metadata, as a successful backend reload would. */ }
  }
})
