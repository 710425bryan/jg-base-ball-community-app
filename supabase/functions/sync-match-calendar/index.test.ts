import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { createMatchRecordInput, parseICalText, planCalendarSync } from '../../../src/utils/googleCalendarParser'
import type { MatchRecord } from '../../../src/types/match'
import { CalendarSourceError, createCalendarSourceFetcher } from './calendarSource'

// Run the complete entry point and real planner without remote imports, secrets,
// a listening server, external calendar requests, or production database writes.
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const parsedSource = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true)
const runtime = ts.transpileModule(parsedSource.statements
  .filter(statement => !ts.isImportDeclaration(statement))
  .map(statement => statement.getText(parsedSource)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText

const calendarUrl = 'https://calendar.google.com/calendar/ical/test/public/basic.ics'
const cancellation = {
  cancelled_at: '2026-10-12T08:00:00Z', cancellation_reason: '球場積水', cancelled_by: 'test-admin'
}
const calendarText = (ids: string[]) => [
  'BEGIN:VCALENDAR',
  ...ids.flatMap(id => [
    'BEGIN:VEVENT', `UID:${id}@google.com`,
    'SUMMARY:友誼賽 中港熊戰 vs 台北熊',
    'DESCRIPTION:組別 / 類別：U12\\n賽事等級：友誼賽\\n集合時間：07:30',
    'LOCATION:新球場', 'DTSTART:20261018T000000Z', 'DTEND:20261018T020000Z', 'END:VEVENT'
  ]),
  'END:VCALENDAR'
].join('\r\n')
const existingMatch = (id: string, overrides: Partial<MatchRecord> = {}): MatchRecord => ({
  ...createMatchRecordInput(parseICalText(calendarText([id]))[0]!),
  id, location: '原球場', cancelled_at: null, ...overrides
})

type UpdateAttempt = { id: string; payload: Record<string, unknown>; filters: Array<[string, unknown]> }
type HarnessOptions = {
  existing: MatchRecord[]
  calendarIds: string[]
  beforeUpdate?: (rows: MatchRecord[], attempt: UpdateAttempt, attemptNumber: number) => void
  updateErrors?: Array<{ code: string; message: string } | null>
  sourceResponses?: Array<Response | Error>
}

const createHarness = (options: HarnessOptions) => {
  const rows = structuredClone(options.existing)
  const updateAttempts: UpdateAttempt[] = []
  const committedUpdates: string[] = []
  const inserted: MatchRecord[] = []
  const updateErrors = [...options.updateErrors || []]
  let handler!: (request: Request) => Promise<Response>

  const from = (table: string) => {
    let operation: 'read' | 'update' | 'insert' = 'read'
    let payload: any
    const filters: Array<[string, unknown]> = []
    const execute = async (mode: 'many' | 'single' | 'maybeSingle' = 'many') => {
      if (operation === 'read') {
        if (table === 'team_members_safe') return { data: [], error: null }
        // Planning gets a snapshot. A later cancellation only changes live rows.
        return { data: structuredClone(rows), error: null }
      }
      if (table !== 'matches') throw new Error(`Unexpected write to ${table}`)
      if (operation === 'insert') {
        const record = { id: `created-${inserted.length + 1}`, ...payload[0] } as MatchRecord
        inserted.push(record)
        rows.push(record)
        return { data: { id: record.id }, error: null }
      }

      const attempt = { id: String(filters.find(([key]) => key === 'id')?.[1]), payload, filters }
      updateAttempts.push(attempt)
      options.beforeUpdate?.(rows, attempt, updateAttempts.length)
      const error = updateErrors.shift()
      if (error) return { data: null, error }
      const matchingRows = rows.filter(row => filters.every(([key, value]) =>
        ((row as unknown as Record<string, unknown>)[key] ?? null) === value))
      for (const row of matchingRows) {
        Object.assign(row, payload)
        committedUpdates.push(row.id)
      }
      if (mode === 'single' && matchingRows.length !== 1) {
        return { data: null, error: { code: 'PGRST116', message: 'Expected exactly one row' } }
      }
      return {
        data: mode === 'many' ? matchingRows.map(row => ({ id: row.id })) : matchingRows[0] ? { id: matchingRows[0].id } : null,
        error: null
      }
    }
    const query: any = {
      select: () => query,
      order: () => query,
      in: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query },
      is: (key: string, value: unknown) => { filters.push([key, value]); return query },
      update: (value: unknown) => { operation = 'update'; payload = value; return query },
      insert: (value: unknown) => { operation = 'insert'; payload = value; return query },
      single: () => execute('single'),
      maybeSingle: () => execute('maybeSingle'),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => execute().then(resolve, reject)
    }
    return query
  }
  const sourceResponses = [...options.sourceResponses || []]
  const fetcher = vi.fn(async () => {
    const next = sourceResponses.shift()
    if (next instanceof Error) throw next
    return next ?? new Response(calendarText(options.calendarIds))
  })
  const getUser = vi.fn(async () => ({ data: { user: { id: 'test-user' } }, error: null }))
  const rpc = vi.fn(async () => ({ data: true, error: null }))
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    SUPABASE_ANON_KEY: 'test-anon-key', MATCH_CALENDAR_SYNC_SECRET: 'test-sync-secret',
    MATCH_CALENDAR_ICAL_URL: calendarUrl
  }
  runInNewContext(runtime, {
    Deno: { env: { get: (key: string) => env[key] } },
    serve: (callback: typeof handler) => { handler = callback },
    createClient: (_url: string, key: string) => key === env.SUPABASE_SERVICE_ROLE_KEY
      ? { from, auth: { getUser } } : { rpc },
    fetch: fetcher, parseICalText, planCalendarSync, Request, Response, URL,
    createCalendarSourceFetcher: () => createCalendarSourceFetcher({ fetcher }), CalendarSourceError,
    console: { log: vi.fn(), error: vi.fn() }
  })
  const run = async (body: Record<string, unknown> = {}, authorization: 'header' | 'body' | 'user' = 'header') => {
    const response = await handler(new Request('https://test.supabase.co/functions/v1/sync-match-calendar', {
      method: 'POST',
      headers: authorization === 'header' ? { 'x-sync-secret': 'test-sync-secret' }
        : authorization === 'user' ? { Authorization: 'Bearer test-user-token' } : {},
      body: JSON.stringify({ minimum_match_date: '2026-10-12', ...body,
        ...(authorization === 'body' ? { sync_secret: 'test-sync-secret' } : {}) })
    }))
    return { status: response.status, summary: await response.json() }
  }
  return { run, rows, updateAttempts, committedUpdates, inserted, fetcher, getUser, rpc }
}

describe('sync-match-calendar cancellation protection', () => {
  it('reports upstream rate limiting without leaking its body, retrying, or writing any match', async () => {
    const original = existingMatch('active')
    const harness = createHarness({ existing: [original], calendarIds: ['active', 'new'],
      sourceResponses: [new Response('<html>private-calendar-token</html>', { status: 429, headers: { 'Retry-After': '120' } })] })
    const result = await harness.run()
    expect(result).toEqual({ status: 503, summary: {
      success: false, error: 'Google Calendar 暫時限制讀取，請稍後再試',
      error_code: 'CALENDAR_SOURCE_RATE_LIMITED', upstream_status: 429, retry_after_seconds: 120, retry_after_provided: true
    } })
    expect(harness.fetcher).toHaveBeenCalledOnce()
    expect(harness.rows).toEqual([original])
    expect(harness.inserted).toEqual([])
    expect(harness.updateAttempts).toEqual([])
  })

  it.each([
    [new Response('<html>private content</html>'), 'CALENDAR_SOURCE_INVALID'],
    [new Response('secret body', { status: 403 }), 'CALENDAR_SOURCE_HTTP'],
    [new Error('secret source URL'), 'CALENDAR_SOURCE_NETWORK'],
    [new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR', { headers: { 'Content-Length': '999999999' } }), 'CALENDAR_SOURCE_TOO_LARGE']
  ])('stops all writes on source failure and still skips cancellation after recovery (%s)', async (failure, code) => {
    const cancelled = existingMatch('cancelled', cancellation)
    const active = existingMatch('active')
    const harness = createHarness({ existing: [cancelled, active], calendarIds: ['cancelled', 'active', 'new'], sourceResponses: [failure as Response | Error] })
    const failed = await harness.run()
    expect(failed.status).toBe(502)
    expect(failed.summary.error_code).toBe(code)
    expect(JSON.stringify(failed.summary)).not.toContain('secret')
    expect(harness.updateAttempts).toEqual([])
    expect(harness.inserted).toEqual([])
    expect(harness.rows).toEqual([cancelled, active])
    expect((await harness.run()).summary).toMatchObject({ updated_count: 1, created_count: 1, skipped_count: 1 })
    expect(harness.rows.find(row => row.id === cancelled.id)).toEqual(cancelled)
  })

  it('plans against freshly loaded cancellation state even when valid source content is cached', async () => {
    const original = existingMatch('active')
    const harness = createHarness({ existing: [original], calendarIds: ['active'] })
    expect((await harness.run({ dry_run: true })).summary).toMatchObject({ source_cache: 'miss', planned: { update: 1 } })
    Object.assign(harness.rows[0]!, cancellation)
    expect((await harness.run()).summary).toMatchObject({ source_cache: 'hit', updated_count: 0, skipped_count: 1 })
    expect(harness.fetcher).toHaveBeenCalledOnce()
    expect(harness.updateAttempts).toEqual([])
    expect(harness.rows[0]).toEqual({ ...original, ...cancellation })
  })

  it('preserves the production custom-secret gateway mode in release configuration', () => {
    const config = readFileSync(new URL('../../config.toml', import.meta.url), 'utf8')
    expect(config).toMatch(/\[functions\.sync-match-calendar\]\s+verify_jwt = false/)
  })

  it('updates the same restored match on the next sync and remains idempotent on later runs', async () => {
    const original = existingMatch('restored', cancellation)
    const harness = createHarness({ existing: [original], calendarIds: ['restored'] })
    expect((await harness.run()).summary).toMatchObject({ updated_count: 0, skipped_count: 1, created_count: 0 })
    expect(harness.updateAttempts).toEqual([])

    Object.assign(harness.rows[0]!, { cancelled_at: null, cancellation_reason: null, cancelled_by: null })
    const restoredResult = await harness.run()
    expect(restoredResult.status).toBe(200)
    expect(restoredResult.summary).toMatchObject({ updated_count: 1, skipped_count: 0, created_count: 0 })
    expect(harness.rows).toHaveLength(1)
    expect(harness.rows[0]).toMatchObject({
      id: original.id, google_calendar_event_id: original.google_calendar_event_id,
      location: '新球場', cancelled_at: null, cancellation_reason: null, cancelled_by: null
    })
    expect(harness.committedUpdates).toEqual([original.id])
    expect(harness.inserted).toEqual([])
    expect((await harness.run()).summary).toMatchObject({ updated_count: 0, skipped_count: 1, created_count: 0 })
    expect(harness.committedUpdates).toEqual([original.id])
  })

  it('skips an already cancelled UID and preserves its original record while updating and creating other matches', async () => {
    const cancelled = existingMatch('cancelled', cancellation)
    const harness = createHarness({ existing: [cancelled, existingMatch('active')], calendarIds: ['cancelled', 'active', 'new'] })
    const result = await harness.run()

    expect(result.status).toBe(200)
    expect(result.summary).toMatchObject({ updated_count: 1, created_count: 1, skipped_count: 1, blocked_count: 0 })
    expect(harness.rows.find(row => row.id === cancelled.id)).toEqual(cancelled)
    expect(harness.updateAttempts.map(attempt => attempt.id)).toEqual(['active'])
    expect(harness.committedUpdates).toEqual(['active'])
    expect(harness.inserted.map(row => row.google_calendar_event_id)).toEqual(['new@google.com'])
  })

  it.each(['header', 'body'] as const)('skips a cancellation committed after planning for %s secret execution and continues the batch', async authorization => {
    const priorCancelled = existingMatch('prior-cancelled', cancellation)
    const original = existingMatch('race')
    const harness = createHarness({
      existing: [priorCancelled, original, existingMatch('active')],
      calendarIds: ['prior-cancelled', 'race', 'active', 'new'],
      beforeUpdate: (rows, attempt) => {
        if (attempt.id === 'race') Object.assign(rows.find(row => row.id === 'race')!, cancellation)
      }
    })
    const result = await harness.run({}, authorization)

    expect(result.status).toBe(200)
    expect(result.summary.planned).toEqual({ create: 1, update: 2, skip: 1, blocked: 0 })
    expect(result.summary).toMatchObject({ success: true, updated_count: 1, created_count: 1, skipped_count: 2 })
    expect(harness.rows.find(row => row.id === 'race')).toEqual({ ...original, ...cancellation })
    expect(harness.updateAttempts.map(attempt => attempt.id)).toEqual(['race', 'active'])
    expect(harness.committedUpdates).toEqual(['active'])
    expect(harness.inserted.map(row => row.google_calendar_event_id)).toEqual(['new@google.com'])
    expect(harness.fetcher).toHaveBeenCalledExactlyOnceWith(calendarUrl, expect.any(Object))
  })

  it('keeps the atomic cancellation guard when retrying an unsupported optional column', async () => {
    const original = existingMatch('race')
    const harness = createHarness({
      existing: [original], calendarIds: ['race'],
      updateErrors: [{ code: 'PGRST204', message: "Could not find the 'google_calendar_event_id' column in the schema cache" }],
      beforeUpdate: (rows, _attempt, attemptNumber) => {
        if (attemptNumber === 2) Object.assign(rows[0]!, cancellation)
      }
    })
    const result = await harness.run()

    expect(result.status).toBe(200)
    expect(result.summary).toMatchObject({ updated_count: 0, skipped_count: 1, created_count: 0 })
    expect(harness.updateAttempts).toHaveLength(2)
    expect(harness.updateAttempts[1]!.payload).not.toHaveProperty('google_calendar_event_id')
    expect(harness.rows[0]).toEqual({ ...original, ...cancellation })
    expect(harness.committedUpdates).toEqual([])
    expect(harness.inserted).toEqual([])
  })

  it.each([
    { code: '57014', message: 'database statement timeout' },
    { code: '42703', message: 'column matches.cancelled_at does not exist' }
  ])('reports database failure instead of treating $code as cancellation', async error => {
    const original = existingMatch('active')
    const harness = createHarness({ existing: [original], calendarIds: ['active'], updateErrors: [error] })
    const result = await harness.run()

    expect(result).toEqual({ status: 500, summary: { success: false, error: error.message } })
    expect(harness.rows).toEqual([original])
    expect(harness.updateAttempts).toHaveLength(1)
    expect(harness.committedUpdates).toEqual([])
    expect(harness.inserted).toEqual([])
  })

  it('does not recreate a match deleted after planning or count it as updated', async () => {
    const harness = createHarness({
      existing: [existingMatch('deleted'), existingMatch('active')], calendarIds: ['deleted', 'active'],
      beforeUpdate: (rows, attempt) => {
        if (attempt.id === 'deleted') rows.splice(rows.findIndex(row => row.id === 'deleted'), 1)
      }
    })
    expect((await harness.run()).summary).toMatchObject({ updated_count: 1, skipped_count: 1, created_count: 0 })
    expect(harness.committedUpdates).toEqual(['active'])
    expect(harness.inserted).toEqual([])
  })

  it('uses the same cancelled skip in authenticated preview and performs no writes', async () => {
    const cancelled = existingMatch('cancelled', cancellation)
    const active = existingMatch('active')
    const harness = createHarness({ existing: [cancelled, active], calendarIds: ['cancelled', 'active', 'new'] })
    const result = await harness.run({ dry_run: true, include_items: true }, 'user')

    expect(result.status).toBe(200)
    expect(result.summary).toMatchObject({ dry_run: true, updated_count: 0, created_count: 0, skipped_count: 1 })
    expect(result.summary.sync_items.map((item: any) => item.action)).toEqual(['skip', 'update', 'create'])
    expect(result.summary.sync_items[0]).toMatchObject({ existingMatchId: 'cancelled', payload: {}, isBlocked: false })
    expect(harness.rows).toEqual([cancelled, active])
    expect(harness.updateAttempts).toEqual([])
    expect(harness.inserted).toEqual([])
    expect(harness.getUser).toHaveBeenCalledOnce()
    expect(harness.rpc).toHaveBeenCalledWith('has_app_permission', { p_feature: 'matches', p_action: 'EDIT' })
  })

  it('continues to reject bearer execution without the sync secret before fetching or writing', async () => {
    const harness = createHarness({ existing: [existingMatch('active')], calendarIds: ['active'] })
    expect((await harness.run({}, 'user')).status).toBe(401)
    expect(harness.fetcher).not.toHaveBeenCalled()
    expect(harness.updateAttempts).toEqual([])
    expect(harness.inserted).toEqual([])
  })
})
