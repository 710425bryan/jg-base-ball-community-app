import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSingleMock = vi.fn()
const createSelectMock = vi.fn(() => ({
  single: createSingleMock
}))
const createInsertMock = vi.fn(() => ({
  select: createSelectMock
}))

const updateSingleMock = vi.fn()
const updateSelectMock = vi.fn(() => ({
  single: updateSingleMock
}))
const updateEqMock = vi.fn(() => ({
  select: updateSelectMock
}))
const updateMock = vi.fn(() => ({
  eq: updateEqMock
}))

const fromMock = vi.fn((table: string) => {
  if (table !== 'matches') {
    throw new Error(`Unexpected table: ${table}`)
  }

  return {
    insert: createInsertMock,
    update: updateMock
  }
})

vi.mock('./supabase', () => ({
  supabase: {
    from: fromMock
  }
}))

describe('matchesApi google calendar column fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retries create and update without google_calendar_event_id when the column is unavailable', async () => {
    createSingleMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "Could not find the 'google_calendar_event_id' column of 'matches' in the schema cache"
        }
      })
      .mockResolvedValueOnce({
        data: {
          id: 'match-1',
          match_name: '春季聯賽',
          opponent: '華興小學',
          match_date: '2026-03-28',
          match_time: '08:00 - 09:30',
          home_score: 0,
          opponent_score: 0,
          absent_players: [],
          lineup: [],
          inning_logs: [],
          batting_stats: []
        },
        error: null
      })

    updateSingleMock.mockResolvedValue({
      data: {
        id: 'match-1',
        match_name: '春季聯賽',
        opponent: '華興小學',
        match_date: '2026-03-28',
        match_time: '08:00 - 09:30',
        home_score: 0,
        opponent_score: 0,
        absent_players: [],
        lineup: [],
        inning_logs: [],
        batting_stats: []
      },
      error: null
    })

    const { matchesApi } = await import('./matchesApi')

    await matchesApi.createMatch({
      google_calendar_event_id: 'uid-1',
      match_name: '春季聯賽',
      opponent: '華興小學',
      match_date: '2026-03-28',
      match_time: '08:00 - 09:30',
      location: '迪化壘球場',
      category_group: 'U12',
      match_level: '一級',
      home_score: 0,
      opponent_score: 0,
      coaches: '',
      players: '',
      note: '',
      photo_url: '',
      absent_players: [],
      lineup: [],
      inning_logs: [],
      batting_stats: []
    })

    expect(createInsertMock).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ google_calendar_event_id: 'uid-1' })]
    )
    expect(createInsertMock).toHaveBeenNthCalledWith(
      2,
      [expect.not.objectContaining({ google_calendar_event_id: expect.anything() })]
    )

    await matchesApi.updateMatch('match-1', {
      google_calendar_event_id: 'uid-1',
      match_name: '春季聯賽更新'
    })

    expect(updateMock).toHaveBeenCalledWith({
      match_name: '春季聯賽更新'
    })
  })
})
