import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMocks = vi.hoisted(() => ({
  fetchPlayerRosterRows: vi.fn(),
  fetchPlayerRosterMeta: vi.fn()
}))

vi.mock('@/services/playerRosterApi', () => ({
  fetchPlayerRosterRows: apiMocks.fetchPlayerRosterRows,
  fetchPlayerRosterMeta: apiMocks.fetchPlayerRosterMeta
}))

describe('player roster store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('fetches full roster rows when no cache exists', async () => {
    apiMocks.fetchPlayerRosterRows.mockResolvedValue([
      { id: 'member-1', name: '小明', sibling_ids: ['member-2'] }
    ])
    apiMocks.fetchPlayerRosterMeta.mockResolvedValue({
      row_count: 1,
      latest_changed_at: '2026-04-29T08:00:00.000Z'
    })

    const { usePlayerRosterStore } = await import('@/stores/playerRoster')
    const store = usePlayerRosterStore()

    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })

    expect(apiMocks.fetchPlayerRosterRows).toHaveBeenCalledWith('full')
    expect(store.members).toEqual([
      { id: 'member-1', name: '小明', sibling_ids: ['member-2'] }
    ])
    expect(store.meta).toEqual({
      row_count: 1,
      latest_changed_at: '2026-04-29T08:00:00.000Z'
    })
  })

  it('keeps cached rows when remote meta is unchanged', async () => {
    apiMocks.fetchPlayerRosterRows.mockResolvedValue([
      { id: 'member-1', name: '小明' }
    ])
    apiMocks.fetchPlayerRosterMeta.mockResolvedValue({
      row_count: 1,
      latest_changed_at: '2026-04-29T08:00:00.000Z'
    })

    const { usePlayerRosterStore } = await import('@/stores/playerRoster')
    const store = usePlayerRosterStore()

    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })
    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })

    expect(apiMocks.fetchPlayerRosterRows).toHaveBeenCalledTimes(1)
    expect(apiMocks.fetchPlayerRosterMeta).toHaveBeenCalledTimes(2)
  })

  it('refetches rows when row count changes', async () => {
    apiMocks.fetchPlayerRosterRows
      .mockResolvedValueOnce([{ id: 'member-1', name: '小明' }])
      .mockResolvedValueOnce([
        { id: 'member-1', name: '小明' },
        { id: 'member-2', name: '小華' }
      ])
    apiMocks.fetchPlayerRosterMeta
      .mockResolvedValueOnce({
        row_count: 1,
        latest_changed_at: '2026-04-29T08:00:00.000Z'
      })
      .mockResolvedValueOnce({
        row_count: 2,
        latest_changed_at: '2026-04-29T08:05:00.000Z'
      })

    const { usePlayerRosterStore } = await import('@/stores/playerRoster')
    const store = usePlayerRosterStore()

    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })
    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })

    expect(apiMocks.fetchPlayerRosterRows).toHaveBeenCalledTimes(2)
    expect(store.members.map((member) => member.id)).toEqual(['member-1', 'member-2'])
  })

  it('refetches rows when latest changed timestamp changes', async () => {
    apiMocks.fetchPlayerRosterRows
      .mockResolvedValueOnce([{ id: 'member-1', name: '小明' }])
      .mockResolvedValueOnce([{ id: 'member-1', name: '小明更新' }])
    apiMocks.fetchPlayerRosterMeta
      .mockResolvedValueOnce({
        row_count: 1,
        latest_changed_at: '2026-04-29T08:00:00.000Z'
      })
      .mockResolvedValueOnce({
        row_count: 1,
        latest_changed_at: '2026-04-29T08:05:00.000Z'
      })

    const { usePlayerRosterStore } = await import('@/stores/playerRoster')
    const store = usePlayerRosterStore()

    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })
    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })

    expect(apiMocks.fetchPlayerRosterRows).toHaveBeenCalledTimes(2)
    expect(store.members[0]?.name).toBe('小明更新')
  })

  it('force refresh always fetches rows', async () => {
    apiMocks.fetchPlayerRosterRows
      .mockResolvedValueOnce([{ id: 'member-1', name: '小明' }])
      .mockResolvedValueOnce([{ id: 'member-1', name: '小明更新' }])
    apiMocks.fetchPlayerRosterMeta.mockResolvedValue({
      row_count: 1,
      latest_changed_at: '2026-04-29T08:00:00.000Z'
    })

    const { usePlayerRosterStore } = await import('@/stores/playerRoster')
    const store = usePlayerRosterStore()

    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })
    await store.refreshRoster({ userId: 'user-1', canEditPlayers: true })

    expect(apiMocks.fetchPlayerRosterRows).toHaveBeenCalledTimes(2)
    expect(store.members[0]?.name).toBe('小明更新')
  })

  it('does not reuse cache across users or source scopes', async () => {
    apiMocks.fetchPlayerRosterRows
      .mockResolvedValueOnce([{ id: 'member-safe', name: '安全名單' }])
      .mockResolvedValueOnce([{ id: 'member-full', name: '完整名單', national_id: 'A123456789' }])
      .mockResolvedValueOnce([{ id: 'member-other', name: '其他使用者' }])
    apiMocks.fetchPlayerRosterMeta.mockResolvedValue({
      row_count: 1,
      latest_changed_at: '2026-04-29T08:00:00.000Z'
    })

    const { usePlayerRosterStore } = await import('@/stores/playerRoster')
    const store = usePlayerRosterStore()

    await store.loadRoster({ userId: 'user-1', canEditPlayers: false })
    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })
    await store.loadRoster({ userId: 'user-2', canEditPlayers: false })

    expect(apiMocks.fetchPlayerRosterRows).toHaveBeenNthCalledWith(1, 'safe')
    expect(apiMocks.fetchPlayerRosterRows).toHaveBeenNthCalledWith(2, 'full')
    expect(apiMocks.fetchPlayerRosterRows).toHaveBeenNthCalledWith(3, 'safe')
    expect(store.members[0]?.id).toBe('member-other')
  })

  it('keeps cached rows when meta check fails', async () => {
    apiMocks.fetchPlayerRosterRows.mockResolvedValue([{ id: 'member-1', name: '小明' }])
    apiMocks.fetchPlayerRosterMeta
      .mockResolvedValueOnce({
        row_count: 1,
        latest_changed_at: '2026-04-29T08:00:00.000Z'
      })
      .mockRejectedValueOnce(new Error('rpc unavailable'))

    const { usePlayerRosterStore } = await import('@/stores/playerRoster')
    const store = usePlayerRosterStore()

    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })
    await store.loadRoster({ userId: 'user-1', canEditPlayers: true })

    expect(apiMocks.fetchPlayerRosterRows).toHaveBeenCalledTimes(1)
    expect(store.members).toEqual([{ id: 'member-1', name: '小明' }])
    expect(store.error).toBe('rpc unavailable')
  })
})
