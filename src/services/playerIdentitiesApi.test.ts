import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), order: vi.fn() }))
vi.mock('@/services/supabase', () => ({ supabase: { from: mocks.from } }))
import { fetchPlayerIdentityLabels } from './playerIdentitiesApi'

describe('fetchPlayerIdentityLabels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({ select: mocks.select })
    mocks.select.mockReturnValue({ order: mocks.order })
  })
  it('reads only labels and normalizes duplicates without reading player data', async () => {
    mocks.order.mockResolvedValue({ data: [{ name: '新太陽社區棒球隊' }, { name: ' 新太陽社區棒球隊 ' }, { name: '教練' }], error: null })
    expect(await fetchPlayerIdentityLabels()).toEqual(['新太陽社區棒球隊'])
    expect(mocks.from).toHaveBeenCalledWith('player_identity_labels')
    expect(mocks.select).toHaveBeenCalledWith('name')
  })
  it('does not hide failed catalog reads', async () => {
    const error = new Error('permission denied')
    mocks.order.mockResolvedValue({ data: null, error })
    await expect(fetchPlayerIdentityLabels()).rejects.toBe(error)
  })
})
