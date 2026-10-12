import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const matchesApiMock = vi.hoisted(() => ({
  cancelMatch: vi.fn(),
  restoreMatch: vi.fn(),
  createMatch: vi.fn(),
  deleteMatch: vi.fn(),
  getMatch: vi.fn(),
  listMatchesForAdmin: vi.fn(),
  listRecentMatches: vi.fn(),
  listUpcomingMatches: vi.fn(),
  listCancelledUpcomingMatches: vi.fn(),
  updateMatch: vi.fn()
}))

vi.mock('@/services/matchesApi', () => ({
  matchesApi: matchesApiMock
}))

describe('matches store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('keeps the same row and media when cancelled; leaves state unchanged on failure', async () => {
    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()
    store.matches = [{ id: 'match-1', photo_url: 'photo.jpg', players: '球員甲' } as any]
    matchesApiMock.cancelMatch.mockRejectedValueOnce(new Error('版本已更新'))
    await expect(store.cancelMatch('match-1', '雨天', 'v1')).rejects.toThrow('版本已更新')
    expect(store.matches[0]?.cancelled_at).toBeUndefined()
    matchesApiMock.cancelMatch.mockResolvedValueOnce({ id: 'match-1', cancelled_at: '2026-10-12', cancellation_reason: '雨天' })
    await store.cancelMatch('match-1', '雨天', 'v1')
    expect(store.matches).toHaveLength(1)
    expect(store.matches[0]).toMatchObject({ photo_url: 'photo.jpg', players: '球員甲', cancelled_at: '2026-10-12' })
  })

  it('does not revive a cancellation when an older list/detail response arrives', async () => {
    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()
    const cancelled = { id: 'm1', cancelled_at: '2026-10-12', cancellation_reason: '雨天', updated_at: '2026-10-12T00:00:00Z' } as any
    store.matches = [cancelled]
    matchesApiMock.listMatchesForAdmin.mockResolvedValueOnce([{ id: 'm1', cancelled_at: null, updated_at: '2026-10-11T00:00:00Z' }])
    await store.listMatchesForAdmin()
    expect(store.matches[0]?.cancelled_at).toBe(cancelled.cancelled_at)
    matchesApiMock.getMatch.mockResolvedValueOnce({ id: 'm1', cancelled_at: null })
    expect(await store.fetchMatch('m1', { force: true })).toMatchObject({ cancelled_at: cancelled.cancelled_at })
    expect(store.matches[0]?.cancelled_at).toBe(cancelled.cancelled_at)
  })

  it('loads active and cancelled upcoming results without sharing their limit', async () => {
    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()
    matchesApiMock.listUpcomingMatches.mockResolvedValueOnce([{ id: 'active' }])
    matchesApiMock.listCancelledUpcomingMatches.mockResolvedValueOnce([{ id: 'cancelled', cancelled_at: '2026-10-12' }])
    await store.fetchUpcomingMatches(8, '2026-10-12')
    expect(store.matches.map((match) => match.id)).toEqual(['active', 'cancelled'])
    expect(matchesApiMock.listCancelledUpcomingMatches).toHaveBeenCalledWith(8, '2026-10-12')
  })

  it('accepts a newer restoration and rejects late cancellation responses down to microsecond versions', async () => {
    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()
    const cancelled = { id: 'm1', cancelled_at: '2026-10-12', cancellation_reason: '雨天', photo_url: 'photo.jpg', updated_at: '2026-10-12T00:00:00.123455Z' } as any
    store.matches = [cancelled]
    const restored = { id: 'm1', cancelled_at: null, cancellation_reason: null, updated_at: '2026-10-12T08:00:00.123456+08:00' }
    matchesApiMock.restoreMatch.mockResolvedValueOnce(restored)
    await store.restoreMatch('m1', cancelled.updated_at)
    expect(store.matches[0]).toMatchObject({ ...restored, photo_url: 'photo.jpg' })
    expect(matchesApiMock.restoreMatch).toHaveBeenCalledWith('m1', cancelled.updated_at)
    matchesApiMock.getMatch.mockResolvedValueOnce(cancelled)
    expect(await store.fetchMatch('m1', { force: true })).toMatchObject(restored)
    matchesApiMock.listMatchesForAdmin.mockResolvedValueOnce([cancelled])
    await store.listMatchesForAdmin()
    expect(store.matches[0]).toMatchObject(restored)
  })

  it('can observe a restore from another client but never uses an undated response to change status', async () => {
    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()
    store.matches = [{ id: 'm1', cancelled_at: '2026-10-12', updated_at: '2026-10-12T00:00:00.123455Z' } as any]
    matchesApiMock.getMatch.mockResolvedValueOnce({ id: 'm1', cancelled_at: null, updated_at: '2026-10-12T00:00:00.123456Z' })
    expect(await store.fetchMatch('m1', { force: true })).toMatchObject({ cancelled_at: null })
    matchesApiMock.getMatch.mockResolvedValueOnce({ id: 'm1', cancelled_at: '2026-10-12' })
    expect(await store.fetchMatch('m1', { force: true })).toMatchObject({ cancelled_at: null })
    matchesApiMock.cancelMatch.mockResolvedValueOnce({ id: 'm1', cancelled_at: '2026-10-13', updated_at: '2026-10-12T00:00:00.123457Z' })
    await store.cancelMatch('m1', '雨天', '2026-10-12T00:00:00.123456Z')
    expect(store.matches[0]?.cancelled_at).toBe('2026-10-13')
  })

  it('preserves cancelled state when restoration fails', async () => {
    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()
    const cancelled = { id: 'm1', cancelled_at: '2026-10-12', updated_at: '2026-10-12T00:00:00Z' } as any
    store.matches = [cancelled]
    matchesApiMock.restoreMatch.mockRejectedValueOnce(new Error('權限不足'))
    await expect(store.restoreMatch('m1', cancelled.updated_at)).rejects.toThrow('權限不足')
    expect(store.matches).toEqual([cancelled])
  })

  it('merges dashboard upcoming and recent matches', async () => {
    matchesApiMock.listUpcomingMatches.mockResolvedValue([{ id: 'match-1', match_name: '未來賽事' }])
    matchesApiMock.listRecentMatches.mockResolvedValue([{ id: 'match-2', match_name: '近期賽事' }])

    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()

    await expect(store.fetchDashboardMatches({
      fromDate: '2026-07-05',
      beforeDate: '2026-07-01',
      upcomingLimit: 2,
      recentLimit: 1
    })).resolves.toEqual([
      { id: 'match-1', match_name: '未來賽事' },
      { id: 'match-2', match_name: '近期賽事' }
    ])
    expect(store.matches.map((match) => match.id)).toEqual(['match-1', 'match-2'])
  })

  it('uses loaded detail cache unless forced', async () => {
    matchesApiMock.getMatch
      .mockResolvedValueOnce({ id: 'match-1', match_name: '詳情' })
      .mockResolvedValueOnce({ id: 'match-1', match_name: '更新詳情' })

    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()

    expect(await store.fetchMatch('match-1')).toMatchObject({ match_name: '詳情' })
    expect(await store.fetchMatch('match-1')).toMatchObject({ match_name: '詳情' })
    expect(await store.fetchMatch('match-1', { force: true })).toMatchObject({ match_name: '更新詳情' })
    expect(matchesApiMock.getMatch).toHaveBeenCalledTimes(2)
  })

  it('updates local rows after create, update, and delete', async () => {
    matchesApiMock.createMatch.mockResolvedValue({ id: 'match-1', match_name: '新增' })
    matchesApiMock.updateMatch.mockResolvedValue({ id: 'match-1', match_name: '更新' })
    matchesApiMock.deleteMatch.mockResolvedValue(undefined)

    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()

    await store.createMatch({ match_name: '新增' } as any)
    await store.updateMatch('match-1', { match_name: '更新' })
    expect(store.matches).toEqual([{ id: 'match-1', match_name: '更新' }])

    await store.deleteMatch('match-1')
    expect(store.matches).toEqual([])
  })

  it('forwards the calendar active-only guard and preserves rows when the guarded write is rejected', async () => {
    const { useMatchesStore } = await import('./matches')
    const store = useMatchesStore()
    const original = { id: 'm1', location: '原球場', cancelled_at: '2026-10-12' } as any
    store.matches = [original]
    const conflict = Object.assign(new Error('資料已異動'), { code: 'PGRST116' })
    matchesApiMock.updateMatch.mockRejectedValueOnce(conflict)
    await expect(store.updateMatch('m1', { location: '新球場' }, { requireActive: true })).rejects.toBe(conflict)
    expect(matchesApiMock.updateMatch).toHaveBeenCalledWith('m1', { location: '新球場' }, { requireActive: true })
    expect(store.matches).toEqual([original])
  })
})
