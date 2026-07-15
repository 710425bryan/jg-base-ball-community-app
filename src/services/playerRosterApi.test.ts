import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const orderMock = vi.fn()
const queryBuilder = { order: orderMock }
const selectMock = vi.fn(() => queryBuilder)
const fromMock = vi.fn(() => ({ select: selectMock }))

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock
  }
}))

describe('playerRosterApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches safe roster rows from the invoker-safe view', async () => {
    orderMock
      .mockReturnValueOnce(queryBuilder)
      .mockResolvedValueOnce({ data: [{ id: 'member-1' }], error: null })

    const { fetchPlayerRosterRows } = await import('./playerRosterApi')
    const rows = await fetchPlayerRosterRows('safe')

    expect(fromMock).toHaveBeenCalledWith('team_members_safe')
    expect(selectMock).toHaveBeenCalledWith('*')
    expect(orderMock).toHaveBeenNthCalledWith(1, 'role')
    expect(orderMock).toHaveBeenNthCalledWith(2, 'name')
    expect(rows).toEqual([{ id: 'member-1' }])
  })

  it('fetches full roster rows through the permission-checked RPC', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'member-full', national_id: 'A123456789' }],
      error: null
    })

    const { fetchPlayerRosterRows } = await import('./playerRosterApi')

    await expect(fetchPlayerRosterRows('full')).resolves.toEqual([
      { id: 'member-full', national_id: 'A123456789' }
    ])
    expect(rpcMock).toHaveBeenCalledWith('list_team_members_for_edit')
    expect(fromMock).not.toHaveBeenCalledWith('team_members')
  })

  it('normalizes roster cache metadata returned as an array', async () => {
    rpcMock.mockResolvedValue({
      data: [{ row_count: '12', latest_changed_at: '2026-07-01T00:00:00.000Z' }],
      error: null
    })

    const { fetchPlayerRosterMeta } = await import('./playerRosterApi')

    await expect(fetchPlayerRosterMeta()).resolves.toEqual({
      row_count: 12,
      latest_changed_at: '2026-07-01T00:00:00.000Z'
    })
    expect(rpcMock).toHaveBeenCalledWith('get_team_members_cache_meta')
  })

  it('throws Supabase errors from roster queries', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('denied') })

    const { fetchPlayerRosterRows } = await import('./playerRosterApi')

    await expect(fetchPlayerRosterRows('full')).rejects.toThrow('denied')
    expect(rpcMock).toHaveBeenCalledWith('list_team_members_for_edit')
  })
})
