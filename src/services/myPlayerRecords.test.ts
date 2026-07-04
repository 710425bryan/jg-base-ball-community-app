import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('myPlayerRecords service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes and filters selectable record members', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { member_id: 'member-1', name: '小明', jersey_number: 7, is_linked: 1 },
        { member_id: '', name: '空資料' }
      ],
      error: null
    })

    const { listMyPlayerRecordMembers } = await import('./myPlayerRecords')

    await expect(listMyPlayerRecordMembers()).resolves.toEqual([
      expect.objectContaining({
        member_id: 'member-1',
        name: '小明',
        jersey_number: '7',
        is_linked: true
      })
    ])
  })

  it('normalizes match arrays and numeric scores', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'match-1',
        absent_players: null,
        lineup: 'bad',
        current_lineup: [{ name: '小明' }],
        inning_logs: null,
        batting_stats: null,
        pitching_stats: [{ name: '小明' }],
        home_score: '5',
        opponent_score: 'bad'
      },
      error: null
    })

    const { getMyPlayerMatchRecords } = await import('./myPlayerRecords')
    const records = await getMyPlayerMatchRecords('member-1')

    expect(rpcMock).toHaveBeenCalledWith('get_my_player_match_records', {
      p_member_id: 'member-1'
    })
    expect(records[0]).toMatchObject({
      absent_players: [],
      lineup: [],
      current_lineup: [{ name: '小明' }],
      pitching_stats: [{ name: '小明' }],
      home_score: 5,
      opponent_score: 0
    })
  })
})
