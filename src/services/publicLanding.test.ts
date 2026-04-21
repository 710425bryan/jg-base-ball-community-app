import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('public landing service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the public landing snapshot through the dedicated rpc', async () => {
    rpcMock.mockResolvedValue({
      data: {
        todayEvent: {
          id: 'event-1',
          title: 'Today Event',
          date: '2026-04-21',
          event_type: 'game'
        },
        todayLeaveNames: ['A*B'],
        todayLeaveCount: 1,
        upcomingMatches: [
          {
            id: 'match-1',
            match_name: 'Friendly Game',
            opponent: 'Rivals',
            match_date: '2026-04-26',
            match_time: '09:00',
            location: 'Main Field',
            category_group: 'U12'
          }
        ],
        latestAnnouncements: [
          {
            id: 'announcement-1',
            title: 'Pinned Announcement',
            content: 'Snapshot content',
            created_at: '2026-04-20T10:00:00.000Z',
            is_pinned: true,
            image_url: null
          }
        ]
      },
      error: null
    })

    const { getPublicLandingSnapshot } = await import('./publicLanding')
    const snapshot = await getPublicLandingSnapshot('2026-04-21')

    expect(rpcMock).toHaveBeenCalledWith('get_public_landing_snapshot', {
      p_today: '2026-04-21'
    })
    expect(snapshot.todayLeaveNames).toEqual(['A*B'])
    expect(snapshot.upcomingMatches).toHaveLength(1)
    expect(snapshot.latestAnnouncements[0]?.title).toBe('Pinned Announcement')
  })
})