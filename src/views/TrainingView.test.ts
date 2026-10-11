// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { usePermissionsStore } from '@/stores/permissions'
import TrainingView from './TrainingView.vue'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  load: vi.fn<() => Promise<string>>(),
  dispose: vi.fn(),
  auth: null as any
}))

vi.mock('@/services/supabase', () => ({ supabase: {} }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => mocks.auth }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/components/training/TrainingWorkspace.vue', async () => {
  const { defineComponent, ref, onUnmounted } = await import('vue')
  return {
    default: defineComponent({
      name: 'TrainingWorkspace',
      setup() {
        const result = ref('loading')
        void mocks.load().then((value) => { result.value = value })
        onUnmounted(mocks.dispose)
        return { result }
      },
      template: '<div data-test="workspace">{{ result }}</div>'
    })
  }
})

const wrappers: VueWrapper[] = []
const mountView = () => {
  const wrapper = mount(TrainingView)
  wrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  mocks.auth = reactive({
    isAuthenticated: true,
    profile: { id: 'user-1', role: 'COMMITTEE', linked_team_member_ids: ['member-1'] }
  })
  usePermissionsStore().currentRole = 'COMMITTEE'
  mocks.load.mockResolvedValue('current training data')
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('TrainingView permission boundary', () => {
  it.each([[], ['CREATE'], ['EDIT'], ['DELETE'], ['CREATE', 'EDIT', 'DELETE']].map((actions) => ({ actions })))(
    'does not mount or load training for linked users with actions %j but no VIEW', async ({ actions }) => {
      usePermissionsStore().permissions = actions.map((action) => ({ feature: 'training', action }))
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.find('[data-test="workspace"]').exists()).toBe(false)
      expect(mocks.load).not.toHaveBeenCalled()
      expect(mocks.replace).toHaveBeenCalledWith('/dashboard')
    }
  )

  it.each([{ linkedIds: [] }, { linkedIds: ['member-1'] }])('allows VIEW and leaves member scope to the workspace for binding %j', async ({ linkedIds }) => {
    mocks.auth.profile.linked_team_member_ids = linkedIds
    usePermissionsStore().permissions = [{ feature: 'training', action: 'VIEW' }]
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toBe('current training data')
    expect(mocks.load).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('allows ADMIN through the existing permission store bypass without permission rows', async () => {
    mocks.auth.profile.role = 'ADMIN'
    usePermissionsStore().currentRole = 'ADMIN'
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toBe('current training data')
  })

  it('unmounts on permission revocation and cannot restore stale pending data after access returns', async () => {
    let resolveOld!: (value: string) => void
    mocks.load.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
    const permissions = usePermissionsStore()
    permissions.permissions = [{ feature: 'training', action: 'VIEW' }]
    const wrapper = mountView()
    await flushPromises()
    permissions.permissions = []
    await flushPromises()
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-test="workspace"]').exists()).toBe(false)
    permissions.permissions = [{ feature: 'training', action: 'VIEW' }]
    await flushPromises()
    resolveOld('stale training data')
    await flushPromises()
    expect(wrapper.text()).toBe('current training data')
    expect(mocks.load).toHaveBeenCalledTimes(2)
    expect(mocks.replace).toHaveBeenCalledWith('/dashboard')
  })

  it('waits for permission refresh before redirecting, while keeping training hidden until VIEW is confirmed', async () => {
    const permissions = usePermissionsStore()
    permissions.permissions = [{ feature: 'training', action: 'VIEW' }]
    const wrapper = mountView()
    await flushPromises()

    permissions.isLoading = true
    await flushPromises()
    expect(wrapper.find('[data-test="workspace"]').exists()).toBe(false)
    expect(mocks.replace).not.toHaveBeenCalled()

    permissions.isLoading = false
    await flushPromises()
    expect(wrapper.text()).toBe('current training data')
    expect(mocks.replace).not.toHaveBeenCalled()

    permissions.isLoading = true
    await flushPromises()
    permissions.permissions = []
    await flushPromises()
    expect(mocks.replace).not.toHaveBeenCalled()
    permissions.isLoading = false
    await flushPromises()
    expect(wrapper.find('[data-test="workspace"]').exists()).toBe(false)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/dashboard')
  })

  it('clears the previous workspace when account binding changes', async () => {
    usePermissionsStore().permissions = [{ feature: 'training', action: 'VIEW' }]
    const wrapper = mountView()
    await flushPromises()
    mocks.auth.profile.linked_team_member_ids = ['member-2']
    await flushPromises()
    expect(mocks.dispose).toHaveBeenCalledTimes(1)
    expect(mocks.load).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toBe('current training data')
  })

  it.each(['isLoading', 'roleMismatch', 'signedOut'])('does not use stale permissions during %s', async (state) => {
    const permissions = usePermissionsStore()
    permissions.permissions = [{ feature: 'training', action: 'VIEW' }]
    if (state === 'isLoading') permissions.isLoading = true
    if (state === 'roleMismatch') mocks.auth.profile.role = 'MEMBER'
    if (state === 'signedOut') mocks.auth.isAuthenticated = false
    mountView()
    await flushPromises()
    expect(mocks.load).not.toHaveBeenCalled()
  })
})
