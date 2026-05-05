import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMocks = vi.hoisted(() => ({
  createTeamGroupSetting: vi.fn(),
  deleteTeamGroupSetting: vi.fn(),
  fetchTeamGroupSettings: vi.fn(),
  reorderTeamGroupSettings: vi.fn(),
  updateTeamGroupSetting: vi.fn()
}))

vi.mock('@/services/teamGroupsApi', () => ({
  createTeamGroupSetting: apiMocks.createTeamGroupSetting,
  deleteTeamGroupSetting: apiMocks.deleteTeamGroupSetting,
  fetchTeamGroupSettings: apiMocks.fetchTeamGroupSettings,
  reorderTeamGroupSettings: apiMocks.reorderTeamGroupSettings,
  updateTeamGroupSetting: apiMocks.updateTeamGroupSetting
}))

const buildGroup = (id: string, name: string, sortOrder: number) => ({
  id,
  name,
  sort_order: sortOrder,
  member_count: 0,
  created_at: null,
  updated_at: null
})

describe('team groups store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('persists reordered groups and updates decorated options', async () => {
    apiMocks.reorderTeamGroupSettings.mockResolvedValue([
      buildGroup('group-b', '泰迪熊(小組)', 10),
      buildGroup('group-a', '拉拉熊(小組)', 20)
    ])

    const { useTeamGroupsStore } = await import('@/stores/teamGroups')
    const store = useTeamGroupsStore()

    await store.reorderGroups(['group-b', 'group-a'])

    expect(apiMocks.reorderTeamGroupSettings).toHaveBeenCalledWith(['group-b', 'group-a'])
    expect(store.groups.map((group) => group.id)).toEqual(['group-b', 'group-a'])
    expect(store.options.map((group) => group.value)).toEqual(['泰迪熊(小組)', '拉拉熊(小組)'])
    expect(store.loaded).toBe(true)
  })
})
