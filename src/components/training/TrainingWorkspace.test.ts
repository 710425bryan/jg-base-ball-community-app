// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { usePermissionsStore } from '@/stores/permissions'
import TrainingWorkspace from './TrainingWorkspace.vue'

const source = readFileSync('src/components/training/TrainingWorkspace.vue', 'utf8')
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  members: vi.fn(),
  sessions: vi.fn(),
  points: vi.fn(),
  adminRegistrations: vi.fn(),
  createRegistration: vi.fn(),
  loadGroups: vi.fn()
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ profile: { role: 'COMMITTEE', linked_team_member_ids: [] } }) }))
vi.mock('@/stores/teamGroups', () => ({ useTeamGroupsStore: () => ({ groups: [], loadGroups: mocks.loadGroups }) }))
vi.mock('@/services/supabase', () => ({ supabase: { from: mocks.from } }))
vi.mock('@/services/trainingApi', () => ({ trainingApi: {
  listMyTrainingMembers: mocks.members,
  listTrainingSessions: mocks.sessions,
  listPointTransactions: mocks.points,
  listAdminRegistrations: mocks.adminRegistrations,
  createRegistration: mocks.createRegistration
} }))
const wrappers: VueWrapper[] = []
beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  const permissions = usePermissionsStore()
  permissions.currentRole = 'COMMITTEE'
  permissions.permissions = [{ feature: 'training', action: 'VIEW' }]
  mocks.members.mockResolvedValue([])
  mocks.sessions.mockResolvedValue([])
  mocks.points.mockResolvedValue([])
  mocks.loadGroups.mockResolvedValue(undefined)
})
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

describe('TrainingWorkspace', () => {
  it('delegates point-member selection to the responsive searchable component', () => {
    expect(source).toContain("import TrainingPointMemberSelector from '@/components/training/TrainingPointMemberSelector.vue'")
    expect(source).toMatch(/<TrainingPointMemberSelector\s+v-model="pointForm\.member_ids"\s+:members="rosterOptions"\s*\/>/)
    expect(source).not.toMatch(/<el-select[\s\S]{0,300}v-model="pointForm\.member_ids"/)
  })

  it('does not grant unbound VIEW users another member or any management data', async () => {
    const wrapper = shallowMount(TrainingWorkspace, {
      global: { stubs: {
        ...Object.fromEntries([
          'el-icon', 'el-select', 'el-option', 'el-button', 'el-date-picker',
          'el-input', 'el-input-number', 'el-form', 'el-form-item', 'el-switch',
          'el-table', 'el-table-column', 'el-dialog', 'el-time-picker', 'el-tag'
        ].map((name) => [name, true])),
        'el-tabs': { template: '<div><slot /></div>' },
        'el-tab-pane': { template: '<div><slot /></div>' }
      } }
    })
    wrappers.push(wrapper)
    await flushPromises()
    expect(mocks.members).toHaveBeenCalledTimes(1)
    expect(mocks.sessions).toHaveBeenCalledWith(null)
    expect(mocks.points).not.toHaveBeenCalled()
    expect(mocks.adminRegistrations).not.toHaveBeenCalled()
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.createRegistration).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('目前沒有可報名的關聯成員')
    expect(wrapper.text()).not.toContain('點數發放')
  })
})
