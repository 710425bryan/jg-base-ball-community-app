import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()
const parserMocks = vi.hoisted(() => ({
  fetchAndParseICal: vi.fn(),
  planCalendarSync: vi.fn()
}))

vi.mock('./supabase', () => ({
  supabase: {
    functions: {
      invoke: invokeMock
    }
  }
}))

vi.mock('@/utils/googleCalendarParser', () => ({
  fetchAndParseICal: parserMocks.fetchAndParseICal,
  planCalendarSync: parserMocks.planCalendarSync
}))

describe('matchCalendarSync service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the Edge Function preview when it returns sync items', async () => {
    invokeMock.mockResolvedValue({
      data: { success: true, sync_items: [{ action: 'create', match: { match_name: '友誼賽' } }] },
      error: null
    })

    const { fetchCalendarSyncPlan } = await import('./matchCalendarSync')
    const result = await fetchCalendarSyncPlan({
      calendarUrl: 'https://calendar.example/ical',
      existingMatches: [],
      rosterMembers: [],
      minimumMatchDate: '2026-07-01'
    })

    expect(result).toEqual({
      source: 'edge-function',
      syncItems: [{ action: 'create', match: { match_name: '友誼賽' } }]
    })
    expect(invokeMock).toHaveBeenCalledWith('sync-match-calendar', {
      body: {
        calendar_url: 'https://calendar.example/ical',
        dry_run: true,
        include_items: true,
        minimum_match_date: '2026-07-01'
      }
    })
    expect(parserMocks.fetchAndParseICal).not.toHaveBeenCalled()
  })

  it('falls back to browser parsing when the Edge Function preview fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    invokeMock.mockResolvedValue({
      data: { success: false, error: 'not configured' },
      error: null
    })
    parserMocks.fetchAndParseICal.mockResolvedValue([{ match_name: 'Fallback Match' }])
    parserMocks.planCalendarSync.mockReturnValue([{ action: 'skip', reason: 'exists' }])

    const { fetchCalendarSyncPlan } = await import('./matchCalendarSync')
    const result = await fetchCalendarSyncPlan({
      calendarUrl: 'https://calendar.example/ical',
      existingMatches: [{ id: 'match-1' }] as any,
      rosterMembers: [{ name: '小明' }] as any
    })

    expect(result).toEqual({
      source: 'browser-proxy',
      syncItems: [{ action: 'skip', reason: 'exists' }]
    })
    expect(parserMocks.fetchAndParseICal).toHaveBeenCalledWith('https://calendar.example/ical')
    expect(parserMocks.planCalendarSync).toHaveBeenCalledWith(
      [{ id: 'match-1' }],
      [{ match_name: 'Fallback Match' }],
      { rosterMembers: [{ name: '小明' }] }
    )
  })
})
