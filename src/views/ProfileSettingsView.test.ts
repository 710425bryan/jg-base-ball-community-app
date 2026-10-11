// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import ProfileSettingsView from './ProfileSettingsView.vue'

const state = vi.hoisted(() => ({ auth: null as any, permissions: null as any }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => state.permissions }))
vi.mock('@/services/supabase', () => ({ supabase: {} }))
vi.mock('@/composables/useReadableTextMode', () => ({ useReadableTextMode: () => ({}) }))
vi.mock('@/components/PushSettingsDialog.vue', () => ({ default: { template: '<div />' } }))

let wrapper: VueWrapper | undefined
beforeEach(() => {
  state.auth = reactive({ profile: { role: 'ADMIN', name: '測試管理者' }, user: { id: 'user-1' }, ensureInitialized: vi.fn().mockResolvedValue(undefined) })
  state.permissions = reactive({ roles: [] })
})
afterEach(() => wrapper?.unmount())

describe('ProfileSettingsView role display', () => {
  it('updates the visible role name from shared metadata without changing the profile role key', async () => {
    wrapper = shallowMount(ProfileSettingsView, { global: { stubs: ['el-form', 'el-form-item', 'el-input', 'el-select', 'el-option', 'el-switch'] } })
    await flushPromises()
    expect(wrapper.text()).toContain('系統管理員')
    state.permissions.roles = [{ role_key: 'ADMIN', role_name: '網站管理團隊' }]
    await nextTick()
    expect(wrapper.text()).toContain('網站管理團隊')
    expect(wrapper.text()).not.toContain('系統管理員')
    expect(state.auth.profile.role).toBe('ADMIN')
  })
})
