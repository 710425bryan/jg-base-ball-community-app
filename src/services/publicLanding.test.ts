import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn(() => ({
  insert: insertMock
}))

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock,
    from: fromMock
  }
}))

describe('public landing service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a public join inquiry without requesting the protected row back', async () => {
    const inquiryId = 'a107eed2-0777-4e42-a5e0-49620d172a8e'
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => inquiryId)
    })
    insertMock.mockResolvedValue({ data: null, error: null })

    const { createPublicJoinInquiry } = await import('./publicLanding')
    const result = await createPublicJoinInquiry({
      parent_name: '測試家長',
      phone: '0900000000',
      line_id: 'test-line',
      child_age_or_grade: '二年級',
      message: '想了解體驗課'
    })

    expect(fromMock).toHaveBeenCalledWith('join_inquiries')
    expect(insertMock).toHaveBeenCalledWith({
      id: inquiryId,
      parent_name: '測試家長',
      phone: '0900000000',
      line_id: 'test-line',
      child_age_or_grade: '二年級',
      message: '想了解體驗課'
    })
    expect(result).toBe(inquiryId)
  })

  it('creates a valid UUID when randomUUID is unavailable in an older webview', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
        return bytes
      })
    })

    const { createPublicJoinInquiryId } = await import('./publicLanding')

    expect(createPublicJoinInquiryId()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })

  it('surfaces insert failures to the public form', async () => {
    const insertError = new Error('insert failed')
    insertMock.mockResolvedValue({ data: null, error: insertError })

    const { createPublicJoinInquiry } = await import('./publicLanding')

    await expect(createPublicJoinInquiry({
      parent_name: '測試家長',
      phone: '0900000000',
      line_id: null,
      child_age_or_grade: '',
      message: ''
    })).rejects.toBe(insertError)
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
