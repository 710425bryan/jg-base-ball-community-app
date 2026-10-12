import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSingleMock = vi.fn()
const rpcMock = vi.fn()
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
const updateFilter = { select: updateSelectMock, is: vi.fn(() => updateFilter) }
const updateEqMock = vi.fn(() => updateFilter)
const updateMock = vi.fn(() => ({
  eq: updateEqMock
}))

const listLimitMock = vi.fn()
const listQueryBuilder = {
  gte: vi.fn(() => listQueryBuilder),
  lt: vi.fn(() => listQueryBuilder),
  is: vi.fn(() => listQueryBuilder),
  not: vi.fn(() => listQueryBuilder),
  order: vi.fn(() => listQueryBuilder),
  limit: listLimitMock
}
const listSelectMock = vi.fn(() => listQueryBuilder)

const fromMock = vi.fn((table: string) => {
  if (table !== 'matches') {
    throw new Error(`Unexpected table: ${table}`)
  }

  return {
    select: listSelectMock,
    insert: createInsertMock,
    update: updateMock
  }
})

vi.mock('./supabase', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock
  }
}))

describe('matchesApi optional column fallback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    rpcMock.mockReset()
  })

  it('cancels through the RPC with a trimmed reason and optimistic version', async () => {
    rpcMock.mockResolvedValue({ data: { id: 'match-1', cancelled_at: '2026-10-12T00:00:00Z', cancellation_reason: '下雨' }, error: null })
    const { matchesApi } = await import('./matchesApi')
    const result = await matchesApi.cancelMatch('match-1', ' 下雨 ', '2026-10-11T00:00:00Z')
    expect(rpcMock).toHaveBeenCalledWith('cancel_match', { p_match_id: 'match-1', p_reason: '下雨', p_expected_updated_at: '2026-10-11T00:00:00Z' })
    expect(result).toMatchObject({ id: 'match-1', cancellation_reason: '下雨', lineup: [] })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('does not write for empty reasons and explains an unavailable cancellation RPC', async () => {
    const { matchesApi } = await import('./matchesApi')
    await expect(matchesApi.cancelMatch('match-1', ' ')).rejects.toThrow('取消原因')
    expect(rpcMock).not.toHaveBeenCalled()
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    await expect(matchesApi.cancelMatch('match-1', '下雨', '2026-10-12T00:00:00Z')).rejects.toThrow('尚未啟用')
  })

  it('keeps permission/concurrency errors and refuses an unconfirmed result', async () => {
    const { matchesApi } = await import('./matchesApi')
    const conflict = { code: '40001', message: '賽事已更新' }
    rpcMock.mockResolvedValueOnce({ data: null, error: conflict })
    await expect(matchesApi.cancelMatch('match-1', '下雨', '2026-10-12T00:00:00Z')).rejects.toBe(conflict)
    rpcMock.mockResolvedValueOnce({ data: { id: 'match-1' }, error: null })
    await expect(matchesApi.cancelMatch('match-1', '下雨', '2026-10-12T00:00:00Z')).rejects.toThrow('取消結果尚未確認')
  })

  it('refuses cancellation and restoration without a version before sending any RPC', async () => {
    const { matchesApi } = await import('./matchesApi')
    await expect(matchesApi.cancelMatch('m1', '誤取消')).rejects.toThrow('重新載入')
    await expect(matchesApi.restoreMatch('m1', null)).rejects.toThrow('重新載入')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('restores through the guarded RPC and normalizes the confirmed same match', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'm1', cancelled_at: null, cancellation_reason: null, cancelled_by: null, updated_at: '2026-10-12T00:00:00.123456Z' }], error: null })
    const { matchesApi } = await import('./matchesApi')
    const result = await matchesApi.restoreMatch('m1', '2026-10-12T00:00:00.123455Z')
    expect(rpcMock).toHaveBeenCalledWith('restore_match', { p_match_id: 'm1', p_expected_updated_at: '2026-10-12T00:00:00.123455Z' })
    expect(result).toMatchObject({ id: 'm1', cancelled_at: null, lineup: [] })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('keeps restore permission/version errors and explains a missing RPC', async () => {
    const { matchesApi } = await import('./matchesApi')
    const conflict = { code: 'P0002', message: '比賽資料已更新' }
    rpcMock.mockResolvedValueOnce({ data: null, error: conflict })
    await expect(matchesApi.restoreMatch('m1', '2026-10-12')).rejects.toBe(conflict)
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
    await expect(matchesApi.restoreMatch('m1', '2026-10-12')).rejects.toThrow('恢復比賽功能尚未啟用')
  })

  it.each([null, { id: 'wrong', cancelled_at: null }, { id: 'm1' }, { id: 'm1', cancelled_at: '2026-10-12' }])('rejects unconfirmed restoration result %j', async data => {
    const { matchesApi } = await import('./matchesApi')
    rpcMock.mockResolvedValueOnce({ data, error: null })
    await expect(matchesApi.restoreMatch('m1', '2026-10-12')).rejects.toThrow('恢復結果尚未確認')
  })

  it('can still read existing records before cancellation columns are deployed', async () => {
    listLimitMock.mockResolvedValueOnce({ data: null, error: { message: 'column matches.cancelled_at does not exist' } })
      .mockResolvedValueOnce({ data: [{ id: 'legacy' }], error: null })
    const { matchesApi } = await import('./matchesApi')
    expect(await matchesApi.listUpcomingMatches()).toHaveLength(1)
    expect(listSelectMock).toHaveBeenNthCalledWith(2, expect.not.stringContaining('cancelled_at'))
  })

  it('handles multiple missing optional column groups without losing legacy fallback', async () => {
    listLimitMock.mockResolvedValueOnce({ data: null, error: { message: 'column matches.cancelled_at does not exist' } })
      .mockResolvedValueOnce({ data: null, error: { message: 'column matches.google_calendar_event_id does not exist' } })
      .mockResolvedValueOnce({ data: [{ id: 'legacy' }], error: null })
    const { matchesApi } = await import('./matchesApi')
    expect(await matchesApi.listUpcomingMatches()).toHaveLength(1)
    expect(listSelectMock).toHaveBeenNthCalledWith(3, expect.not.stringContaining('google_calendar_event_id'))
    expect(listSelectMock).toHaveBeenNthCalledWith(3, expect.not.stringContaining('cancelled_at'))
  })

  it('never sends cancellation audit fields through generic updates', async () => {
    updateSingleMock.mockResolvedValueOnce({ data: { id: 'match-1' }, error: null })
    const { matchesApi } = await import('./matchesApi')
    await matchesApi.updateMatch('match-1', { note: '備註', cancelled_at: null, cancellation_reason: '', cancelled_by: null } as any)
    expect(updateMock).toHaveBeenCalledWith({ note: '備註' })
    expect(updateFilter.is).toHaveBeenCalledWith('cancelled_at', null)
  })

  it('filters active and cancelled schedules separately before limiting results', async () => {
    listLimitMock.mockResolvedValue({ data: [], error: null })
    const { matchesApi } = await import('./matchesApi')
    await matchesApi.listUpcomingMatches(8, '2026-10-12')
    await matchesApi.listRecentMatches(4, '2026-10-12')
    expect(listQueryBuilder.is).toHaveBeenCalledTimes(2)
    await matchesApi.listCancelledUpcomingMatches(8, '2026-10-12')
    expect(listQueryBuilder.not).toHaveBeenCalledWith('cancelled_at', 'is', null)
  })

  it('explains an atomic update rejected because the match is no longer active', async () => {
    updateSingleMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    const { matchesApi } = await import('./matchesApi')
    await expect(matchesApi.updateMatch('m1', { note: '舊表單' })).rejects.toMatchObject({
      code: 'PGRST116', message: expect.stringContaining('可能已取消')
    })
  })

  it('keeps the calendar cancellation guard after an earlier legacy-schema read fallback', async () => {
    listLimitMock.mockResolvedValueOnce({ data: null, error: { message: 'column matches.cancelled_at does not exist' } })
      .mockResolvedValueOnce({ data: [{ id: 'm1' }], error: null })
    updateSingleMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    const { matchesApi } = await import('./matchesApi')
    await matchesApi.listUpcomingMatches()
    await expect(matchesApi.updateMatch('m1', { location: '新球場' }, { requireActive: true }))
      .rejects.toMatchObject({ code: 'PGRST116' })
    expect(updateFilter.is).toHaveBeenCalledWith('cancelled_at', null)
    expect(updateMock).toHaveBeenCalledTimes(1)
  })

  it('never removes the calendar guard when a missing cancellation column forces retries', async () => {
    const missingColumn = { code: '42703', message: 'column matches.cancelled_at does not exist' }
    updateSingleMock.mockResolvedValue({ data: null, error: missingColumn })
    const { matchesApi } = await import('./matchesApi')
    await expect(matchesApi.updateMatch('m1', { location: '新球場' }, { requireActive: true }))
      .rejects.toBe(missingColumn)
    expect(updateMock.mock.calls.length).toBeGreaterThan(0)
    expect(updateFilter.is).toHaveBeenCalledTimes(updateMock.mock.calls.length)
    for (const call of updateFilter.is.mock.calls) expect(call).toEqual(['cancelled_at', null])
  })

  it('retries upcoming match selects without google_calendar_event_id when the column is unavailable', async () => {
    listLimitMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'column matches.google_calendar_event_id does not exist'
        }
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'match-1',
            match_name: '春季聯賽',
            opponent: '華興小學',
            match_date: '2026-04-30',
            match_time: '08:00 - 09:30',
            home_score: 0,
            opponent_score: 0
          }
        ],
        error: null
      })

    const { matchesApi } = await import('./matchesApi')
    const result = await matchesApi.listUpcomingMatches(8, '2026-04-30')

    expect(listSelectMock).toHaveBeenNthCalledWith(1, expect.stringContaining('google_calendar_event_id'))
    expect(listSelectMock).toHaveBeenNthCalledWith(2, expect.not.stringContaining('google_calendar_event_id'))
    expect(listQueryBuilder.gte).toHaveBeenCalledWith('match_date', '2026-04-30')
    expect(result[0]).toEqual(expect.objectContaining({
      id: 'match-1',
      absent_players: [],
      lineup: []
    }))
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

  it('retries upcoming match selects without video_url when the column is unavailable', async () => {
    listLimitMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'column matches.video_url does not exist'
        }
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'match-1',
            match_name: '春季聯賽',
            opponent: '華興小學',
            match_date: '2026-04-30',
            match_time: '08:00 - 09:30',
            home_score: 0,
            opponent_score: 0
          }
        ],
        error: null
      })

    const { matchesApi } = await import('./matchesApi')
    await matchesApi.listUpcomingMatches(8, '2026-04-30')

    expect(listSelectMock).toHaveBeenNthCalledWith(1, expect.stringContaining('video_url'))
    expect(listSelectMock).toHaveBeenNthCalledWith(2, expect.not.stringContaining('video_url'))
  })

  it('retries create without video_url when the column is unavailable', async () => {
    createSingleMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "Could not find the 'video_url' column of 'matches' in the schema cache"
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

    const { matchesApi } = await import('./matchesApi')

    await matchesApi.createMatch({
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
      video_url: 'youtube.com/watch?v=match-1',
      absent_players: [],
      lineup: [],
      inning_logs: [],
      batting_stats: []
    })

    expect(createInsertMock).toHaveBeenNthCalledWith(
      1,
      [expect.objectContaining({ video_url: 'youtube.com/watch?v=match-1' })]
    )
    expect(createInsertMock).toHaveBeenNthCalledWith(
      2,
      [expect.not.objectContaining({ video_url: expect.anything() })]
    )
  })

  it('retries create and update without match_fee_amount when the column is unavailable', async () => {
    createSingleMock
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "Could not find the 'match_fee_amount' column of 'matches' in the schema cache"
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
      match_name: '春季聯賽',
      opponent: '華興小學',
      match_date: '2026-03-28',
      match_time: '08:00 - 09:30',
      location: '迪化壘球場',
      category_group: 'U12',
      match_level: '一級',
      match_fee_amount: 250,
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
      [expect.objectContaining({ match_fee_amount: 250 })]
    )
    expect(createInsertMock).toHaveBeenNthCalledWith(
      2,
      [expect.not.objectContaining({ match_fee_amount: expect.anything() })]
    )

    await matchesApi.updateMatch('match-1', {
      match_name: '春季聯賽更新',
      match_fee_amount: 300
    })

    expect(updateMock).toHaveBeenCalledWith({
      match_name: '春季聯賽更新'
    })
  })
})
