import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    vi.resetAllMocks()
  })

  afterEach(() => vi.restoreAllMocks())

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

  it.each(['missing deployment', 'legacy response'])('uses compatibility parsing only for %s', async (reason) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    invokeMock.mockResolvedValue(reason === 'legacy response'
      ? { data: { success: true }, error: null }
      : { data: null, error: { context: new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 }) } })
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

  it.each([
    { status: 503, body: { error_code: 'CALENDAR_SOURCE_RATE_LIMITED', upstream_status: 429, retry_after_seconds: 75 }, message: 'Google 行事曆暫時限制讀取，請等待 75 秒後再試。' },
    { status: 429, body: {}, headers: { 'Retry-After': '45' }, message: 'Google 行事曆暫時限制讀取，請等待 45 秒後再試。' },
    { status: 503, body: { upstream_status: 429 }, message: 'Google 行事曆暫時限制讀取，請稍後再試。' },
    { status: 503, body: { error_code: 'CALENDAR_SOURCE_BUSY', retry_after_seconds: 1 }, message: '行事曆同步服務忙碌中，請等待 1 秒後再試。' },
    { status: 401, body: {}, message: '登入已失效或沒有賽事同步權限，請重新登入並確認權限。' },
    { status: 403, body: {}, message: '登入已失效或沒有賽事同步權限，請重新登入並確認權限。' },
    { status: 502, body: { error_code: 'CALENDAR_SOURCE_HTTP', upstream_status: 404 }, message: '暫時無法讀取 Google 行事曆，請稍後再試。' },
    { status: 500, body: { error: 'private diagnostic' }, message: '行事曆同步服務暫時無法使用，請稍後再試。' }
  ])('does not proxy or retry a denied/unavailable source: $status $message', async ({ status, body, headers, message }) => {
    const response = new Response(JSON.stringify(body), { status, headers })
    invokeMock.mockResolvedValue({ data: null, error: { message: 'Edge returned non-2xx', context: response } })
    const { fetchCalendarSyncPlan } = await import('./matchCalendarSync')
    await expect(fetchCalendarSyncPlan({ calendarUrl: 'https://calendar.example/ical', existingMatches: [], rosterMembers: [] }))
      .rejects.toThrow(message)
    expect(response.bodyUsed).toBe(false)
    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(parserMocks.fetchAndParseICal).not.toHaveBeenCalled()
    expect(parserMocks.planCalendarSync).not.toHaveBeenCalled()
  })

  it('honors an HTTP-date Retry-After and safely ignores unreadable error bodies', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-12T06:00:00Z'))
    invokeMock.mockResolvedValue({ data: null, error: { context: new Response('not json', {
      status: 429, headers: { 'Retry-After': 'Mon, 12 Oct 2026 06:02:00 GMT' }
    }) } })
    const { fetchCalendarSyncPlan } = await import('./matchCalendarSync')
    await expect(fetchCalendarSyncPlan({ calendarUrl: 'https://calendar.example/ical', existingMatches: [], rosterMembers: [] }))
      .rejects.toThrow('請等待 120 秒後再試。')
    expect(parserMocks.fetchAndParseICal).not.toHaveBeenCalled()
  })

  it('rejects structured source errors even if an older gateway returns HTTP 200', async () => {
    invokeMock.mockResolvedValue({ data: { success: false, error_code: 'CALENDAR_SOURCE_RATE_LIMITED', retry_after_seconds: 60 }, error: null })
    const { fetchCalendarSyncPlan } = await import('./matchCalendarSync')
    await expect(fetchCalendarSyncPlan({ calendarUrl: 'https://calendar.example/ical', existingMatches: [], rosterMembers: [] }))
      .rejects.toThrow('請等待 60 秒後再試。')
    expect(parserMocks.fetchAndParseICal).not.toHaveBeenCalled()
  })

  it('fails closed on network errors without sending the source URL to a proxy', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('Failed to send request') })
    const { fetchCalendarSyncPlan } = await import('./matchCalendarSync')
    await expect(fetchCalendarSyncPlan({ calendarUrl: 'https://calendar.example/ical', existingMatches: [], rosterMembers: [] }))
      .rejects.toThrow('行事曆同步服務暫時無法使用')
    expect(parserMocks.fetchAndParseICal).not.toHaveBeenCalled()
  })

  it('keeps real planner cancellation protection when legacy compatibility parsing is used', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const actual = await vi.importActual<typeof import('@/utils/googleCalendarParser')>('@/utils/googleCalendarParser')
    const parsed = actual.parseICalText(`BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:cancelled-calendar@google.com\nDTSTART:20261018T000000Z\nDTEND:20261018T020000Z\nSUMMARY:友誼賽 中港熊戰 vs 台北熊\nDESCRIPTION:組別 / 類別：U12\\n賽事等級：友誼賽\nLOCATION:新球場\nEND:VEVENT\nEND:VCALENDAR`)
    const cancelled = { ...actual.createMatchRecordInput(parsed[0]!), id: 'cancelled', location: '保留原球場', cancelled_at: '2026-10-12T00:00:00Z' }
    const activeParsed = { ...parsed[0]!, id: 'active-calendar@google.com' }
    const active = { ...actual.createMatchRecordInput(activeParsed), id: 'active', location: '舊球場' }
    invokeMock.mockResolvedValue({ data: { success: true }, error: null })
    parserMocks.fetchAndParseICal.mockResolvedValue([...parsed, activeParsed])
    parserMocks.planCalendarSync.mockImplementation(actual.planCalendarSync)
    const { fetchCalendarSyncPlan } = await import('./matchCalendarSync')
    const result = await fetchCalendarSyncPlan({ calendarUrl: 'https://calendar.example/ical', existingMatches: [cancelled, active] as any, rosterMembers: [], minimumMatchDate: '2026-10-12' })
    expect(result.syncItems).toEqual([
      expect.objectContaining({ action: 'skip', existingMatchId: 'cancelled', payload: {}, isBlocked: false }),
      expect.objectContaining({ action: 'update', existingMatchId: 'active', payload: expect.objectContaining({ location: '新球場' }), isBlocked: false })
    ])
  })
})
