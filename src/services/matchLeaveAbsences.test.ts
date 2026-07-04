import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('matchLeaveAbsences service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early when preview input has no date or player names', async () => {
    const { previewMatchLeaveAbsences } = await import('./matchLeaveAbsences')

    await expect(previewMatchLeaveAbsences('', ['小明'])).resolves.toEqual([])
    await expect(previewMatchLeaveAbsences('2026-07-05', [' ', ''])).resolves.toEqual([])
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('deduplicates player names and filters leave rows by match time overlap', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          member_id: 'member-1',
          member_name: '小明',
          leave_type: '事假',
          leave_time_segment: 'morning',
          start_date: '2026-07-05',
          end_date: '2026-07-05',
          reason: '家事'
        },
        {
          member_id: 'member-2',
          member_name: '小華',
          leave_type: '事假',
          leave_time_segment: 'afternoon',
          start_date: '2026-07-05',
          end_date: '2026-07-05'
        }
      ],
      error: null
    })

    const { previewMatchLeaveAbsences } = await import('./matchLeaveAbsences')
    const result = await previewMatchLeaveAbsences('2026-07-05', ['小明', '小明', '小華'], '09:00 - 12:00')

    expect(rpcMock).toHaveBeenCalledWith('preview_match_leave_absences', {
      p_match_date: '2026-07-05',
      p_player_names: ['小明', '小華'],
      p_match_time: '09:00 - 12:00'
    })
    expect(result.map((player) => player.name)).toEqual(['小明'])
  })

  it('loads persisted match leave absences by match id', async () => {
    rpcMock.mockResolvedValue({
      data: [{ member_name: '小明', leave_time_segment: 'full_day' }],
      error: null
    })

    const { getMatchLeaveAbsences } = await import('./matchLeaveAbsences')

    await expect(getMatchLeaveAbsences('match-1')).resolves.toEqual([
      expect.objectContaining({ name: '小明' })
    ])
    await expect(getMatchLeaveAbsences('')).resolves.toEqual([])
  })
})
