import { afterEach, describe, expect, it, vi } from 'vitest'
import { CalendarSourceError, createCalendarSourceFetcher } from './calendarSource'

const url = 'https://calendar.google.com/calendar/ical/example/public/basic.ics'
const ical = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'
afterEach(() => vi.useRealTimers())

describe('calendar source retrieval', () => {
  it('caches only a complete calendar for 60 seconds and then fetches again', async () => {
    let now = 1000
    const fetcher = vi.fn(async () => new Response(ical))
    const read = createCalendarSourceFetcher({ fetcher, now: () => now })
    expect(await read(url)).toEqual({ text: ical, cache: 'miss' })
    now += 59_999
    expect(await read(url)).toEqual({ text: ical, cache: 'hit' })
    now += 1
    expect((await read(url)).cache).toBe('miss')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({
      headers: expect.objectContaining({ 'user-agent': 'jg-base-ball-community-app-calendar-sync/1.0' })
    }))
  })

  it('coalesces concurrent reads of the same URL', async () => {
    let complete!: (response: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { complete = resolve }))
    const read = createCalendarSourceFetcher({ fetcher })
    const first = read(url)
    const second = read(url)
    complete(new Response(ical))
    expect((await first).cache).toBe('miss')
    expect((await second).cache).toBe('coalesced')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it.each([
    ['90', 90], ['Thu, 01 Jan 1970 00:02:00 GMT', 120], [null, 60], ['nonsense', 60]
  ])('honors Retry-After %s without immediate retries or returning HTML', async (retryAfter, seconds) => {
    let now = 0
    const fetcher = vi.fn(async () => new Response('<html>secret upstream page</html>', {
      status: 429, headers: retryAfter ? { 'Retry-After': String(retryAfter) } : {}
    }))
    const read = createCalendarSourceFetcher({ fetcher, now: () => now })
    await expect(read(url)).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_RATE_LIMITED', upstreamStatus: 429, retryAfterSeconds: seconds })
    now = 1_000
    await expect(read(url)).rejects.toMatchObject({ retryAfterSeconds: Number(seconds) - 1 })
    expect(fetcher).toHaveBeenCalledOnce()
    now = Number(seconds) * 1_000
    await expect(read(url)).rejects.toBeInstanceOf(CalendarSourceError)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it.each(['<html>not a calendar</html>', 'BEGIN:VCALENDAR\r\nVERSION:2.0', 'BEGIN:VEVENT\r\nEND:VEVENT'])('rejects invalid or truncated content without caching it', async body => {
    const fetcher = vi.fn(async () => new Response(body))
    const read = createCalendarSourceFetcher({ fetcher })
    await expect(read(url)).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_INVALID' })
    await expect(read(url)).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_INVALID' })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('sanitizes network errors that contain source URLs and tokens', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError(`${url}?token=secret-personal-data`) })
    const read = createCalendarSourceFetcher({ fetcher })
    const error = await read(url).catch(error => error)
    expect(error).toMatchObject({ code: 'CALENDAR_SOURCE_NETWORK' })
    expect(error.message).not.toContain('secret')
    expect(error.message).not.toContain(url)
    expect(error.cause).toBeUndefined()
  })

  it('reports non-rate-limit HTTP errors without reading the upstream body', async () => {
    const body = new ReadableStream({ pull: () => { throw new Error('must not read upstream HTML') } })
    const read = createCalendarSourceFetcher({ fetcher: vi.fn(async () => new Response(body, { status: 403 })) })
    await expect(read(url)).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_HTTP', upstreamStatus: 403 })
  })

  it('times out response headers even when the transport ignores cancellation', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(() => new Promise<Response>(() => {}))
    const read = createCalendarSourceFetcher({ fetcher, timeoutMs: 100 })
    const expectation = expect(read(url)).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(100)
    await expectation
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  })

  it('keeps the timeout active while the response body stalls', async () => {
    vi.useFakeTimers()
    const cancelled = vi.fn()
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('BEGIN:VCALENDAR\r\n')) }, cancel: cancelled })
    const read = createCalendarSourceFetcher({ fetcher: vi.fn(async () => new Response(body)), timeoutMs: 100 })
    const expectation = expect(read(url)).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(100)
    await expectation
    expect(cancelled).toHaveBeenCalledOnce()
  })

  it.each([true, false])('bounds response bytes with content-length present=%s', async withLength => {
    const fetcher = vi.fn(async () => new Response(ical, { headers: withLength ? { 'Content-Length': '9999' } : {} }))
    const read = createCalendarSourceFetcher({ fetcher, maxBytes: 20 })
    await expect(read(url)).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_TOO_LARGE' })
  })

  it('limits cached URLs and evicts the oldest completed entry', async () => {
    const fetcher = vi.fn(async () => new Response(ical))
    const read = createCalendarSourceFetcher({ fetcher, maxEntries: 2 })
    await read(`${url}?a`)
    await read(`${url}?b`)
    await read(`${url}?c`)
    expect((await read(`${url}?b`)).cache).toBe('hit')
    expect((await read(`${url}?a`)).cache).toBe('miss')
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('bounds simultaneous distinct URLs without starting an extra upstream request', async () => {
    let complete!: (response: Response) => void
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { complete = resolve }))
    const read = createCalendarSourceFetcher({ fetcher, maxEntries: 1 })
    const first = read(url)
    await expect(read(`${url}?other`)).rejects.toMatchObject({ code: 'CALENDAR_SOURCE_BUSY', retryAfterSeconds: 1 })
    complete(new Response(ical))
    await first
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
