import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('playerBalances service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes balance summaries and scalar balance values', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ member_id: 1, member_name: '小明', role: '球員', balance_amount: '250', is_linked: 1 }],
        error: null
      })
      .mockResolvedValueOnce({ data: '125', error: null })

    const { getPlayerBalance, listPlayerBalances } = await import('./playerBalances')

    expect(await listPlayerBalances()).toEqual([
      {
        member_id: '1',
        member_name: '小明',
        role: '球員',
        balance_amount: 250,
        is_linked: true
      }
    ])
    expect(await getPlayerBalance('member-1')).toBe(125)
  })

  it('normalizes transactions and truncates manual adjustments', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ id: 1, member_id: 'member-1', delta: '50', balance_after: '150', created_at: '2026-07-01' }],
        error: null
      })
      .mockResolvedValueOnce({
        data: [{ id: 2, member_id: 'member-1', delta: '12', balance_after: '162' }],
        error: null
      })

    const { adjustPlayerBalance, listPlayerBalanceTransactions } = await import('./playerBalances')

    expect(await listPlayerBalanceTransactions(null)).toEqual([
      expect.objectContaining({
        id: '1',
        delta: 50,
        balance_after: 150,
        source: 'manual_adjustment'
      })
    ])
    expect(await adjustPlayerBalance('member-1', 12.9, '')).toEqual([
      expect.objectContaining({ id: '2', delta: 12 })
    ])
    expect(rpcMock).toHaveBeenLastCalledWith('adjust_player_balance', {
      p_member_id: 'member-1',
      p_delta: 12,
      p_reason: null
    })
  })
})
