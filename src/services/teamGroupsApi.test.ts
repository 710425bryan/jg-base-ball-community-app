import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('teamGroupsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists and normalizes team group settings', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 1, name: '國中校隊', sort_order: '20', member_count: '3' }],
      error: null
    })

    const { fetchTeamGroupSettings } = await import('./teamGroupsApi')

    await expect(fetchTeamGroupSettings()).resolves.toEqual([
      expect.objectContaining({
        id: '1',
        name: '國中校隊',
        sort_order: 20,
        member_count: 3
      })
    ])
    expect(rpcMock).toHaveBeenCalledWith('list_team_group_settings')
  })

  it('sends create, update, delete, and reorder payloads to their RPCs', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: [{ id: 'new', name: '新組', sort_order: 30 }], error: null })
      .mockResolvedValueOnce({ data: { id: 'new', name: '新組更新', sort_order: 40 }, error: null })
      .mockResolvedValueOnce({
        data: [{ deleted_name: '舊組', transferred_to_name: '新組', transferred_member_count: '2' }],
        error: null
      })
      .mockResolvedValueOnce({ data: [{ id: 'new', name: '新組更新', sort_order: 10 }], error: null })

    const {
      createTeamGroupSetting,
      deleteTeamGroupSetting,
      reorderTeamGroupSettings,
      updateTeamGroupSetting
    } = await import('./teamGroupsApi')

    expect(await createTeamGroupSetting('新組')).toMatchObject({ id: 'new', name: '新組' })
    expect(await updateTeamGroupSetting('new', '新組更新')).toMatchObject({ name: '新組更新' })
    expect(await deleteTeamGroupSetting('old', 'new')).toEqual({
      deleted_name: '舊組',
      transferred_to_name: '新組',
      transferred_member_count: 2
    })
    expect(await reorderTeamGroupSettings(['new'])).toEqual([
      expect.objectContaining({ id: 'new', sort_order: 10 })
    ])

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'create_team_group_setting', { p_name: '新組' })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'update_team_group_setting', { p_id: 'new', p_name: '新組更新' })
    expect(rpcMock).toHaveBeenNthCalledWith(3, 'delete_team_group_setting', {
      p_id: 'old',
      p_transfer_to_id: 'new'
    })
    expect(rpcMock).toHaveBeenNthCalledWith(4, 'reorder_team_group_settings', { p_group_ids: ['new'] })
  })
})
