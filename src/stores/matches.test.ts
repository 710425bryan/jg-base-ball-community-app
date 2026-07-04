import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const matchesApiMock = vi.hoisted(() => ({
  createMatch: vi.fn(),
  deleteMatch: vi.fn(),
  getMatch: vi.fn(),
  listMatchesForAdmin: vi.fn(),
  listRecentMatches: vi.fn(),
  listUpcomingMatches: vi.fn(),
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
})
