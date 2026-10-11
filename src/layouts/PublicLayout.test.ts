// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import { RouterLinkStub, shallowMount, type VueWrapper } from '@vue/test-utils'
import PublicLayout from './PublicLayout.vue'

const state = vi.hoisted(() => ({ auth: null as any, permissions: null as any }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => state.auth }))
vi.mock('@/stores/permissions', () => ({ usePermissionsStore: () => state.permissions }))
vi.mock('@/composables/useAppRoleNames', () => ({ useAppRoleNames: vi.fn() }))
vi.mock('@/composables/useVersionCheck', () => ({ useVersionCheck: () => ({}) }))
vi.mock('@/composables/useReadableTextMode', () => ({ useReadableTextMode: () => ({}) }))
vi.mock('@/components/LoginModal.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/layout/HolidayThemeRibbon.vue', () => ({ default: { template: '<div />' } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ currentRoute: { value: { path: '/' } } }) }))

let wrapper: VueWrapper | undefined
beforeEach(() => {
  state.auth = reactive({ isAuthenticated: true, profile: { role: 'MANAGER', name: '測試管理者' } })
  state.permissions = reactive({ roles: [] })
})
afterEach(() => wrapper?.unmount())

describe('PublicLayout role display', () => {
  it('reacts to loaded and renamed role metadata while retaining the original fallback', async () => {
    wrapper = shallowMount(PublicLayout, { global: { stubs: { RouterLink: RouterLinkStub, RouterView: true, ElIcon: true } } })
    expect(wrapper.text()).toContain('經理')
    state.permissions.roles = [{ role_key: 'MANAGER', role_name: '球隊經營團隊' }]
    await nextTick()
    expect(wrapper.text()).toContain('球隊經營團隊')
    state.permissions.roles[0].role_name = '行政團隊'
    await nextTick()
    expect(wrapper.text()).toContain('行政團隊')
    expect(wrapper.text()).not.toContain('球隊經營團隊')
    expect(state.auth.profile.role).toBe('MANAGER')
  })
})
