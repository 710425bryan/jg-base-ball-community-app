// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  channel: vi.fn(), removeChannel: vi.fn(), from: vi.fn(), read: vi.fn()
}))
vi.mock('@/services/supabase', () => ({ supabase: mocks }))

import { createProfileAccessMonitor } from './profileAccessMonitor'

describe('profile access monitor', () => {
  let receive: (payload: any) => void
  let status: (value: string) => void
  let channel: any
  let stop: (() => void) | undefined
  let visible = 'visible'
  const active = { id: 'user-1', is_active: true, access_start: null, access_end: null }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    visible = 'visible'
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible as DocumentVisibilityState)
    channel = {
      on: vi.fn((_kind, _filter, callback) => { receive = callback; return channel }),
      subscribe: vi.fn(callback => { status = callback; return channel })
    }
    mocks.channel.mockReturnValue(channel)
    mocks.removeChannel.mockResolvedValue('ok')
    mocks.read.mockResolvedValue({ data: active, error: null })
    const query: any = {
      select: vi.fn(() => query), eq: vi.fn(() => query),
      abortSignal: vi.fn(() => query), maybeSingle: mocks.read
    }
    mocks.from.mockReturnValue(query)
  })

  afterEach(() => { stop?.(); vi.useRealTimers(); vi.restoreAllMocks() })

  const start = () => {
    const onDenied = vi.fn()
    const monitor = createProfileAccessMonitor('user-1', active, onDenied)
    stop = monitor.stop
    return { ...monitor, onDenied }
  }

  it('subscribes only to this profile and rejects suspension synchronously', () => {
    const { onDenied } = start()
    expect(channel.on).toHaveBeenCalledWith('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'id=eq.user-1'
    }, expect.any(Function))
    receive({ new: { ...active, id: 'other-user', is_active: false } })
    expect(onDenied).not.toHaveBeenCalled()
    receive({ new: { ...active, is_active: false } })
    expect(onDenied).toHaveBeenCalledWith('此帳號已被停權，無法登入系統。')
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('rechecks after subscription, foreground, online and fallback while deduplicating reads', async () => {
    const { check } = start()
    let resolve!: (value: any) => void
    mocks.read.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    status('SUBSCRIBED')
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))
    const pending = check()
    expect(mocks.read).toHaveBeenCalledTimes(1)
    resolve({ data: active, error: null })
    await pending
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocks.read).toHaveBeenCalledTimes(2)
    visible = 'hidden'
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mocks.read).toHaveBeenCalledTimes(2)
    visible = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    await check()
    expect(mocks.read).toHaveBeenCalledTimes(3)
  })

  it('does not treat network failure as suspension and retries on reconnect', async () => {
    const { check, onDenied } = start()
    mocks.read.mockResolvedValueOnce({ data: null, error: new Error('offline') })
    await check()
    expect(onDenied).not.toHaveBeenCalled()
    mocks.read.mockResolvedValueOnce({ data: { ...active, is_active: false }, error: null })
    status('SUBSCRIBED')
    await check()
    expect(onDenied).toHaveBeenCalledOnce()
  })

  it('ignores pending reads and realtime callbacks after stopping and removes listeners', async () => {
    const { check, onDenied, stop } = start()
    let resolve!: (value: any) => void
    mocks.read.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = check()
    stop()
    stop()
    resolve({ data: { ...active, is_active: false }, error: null })
    await pending
    receive({ new: { ...active, is_active: false } })
    status('SUBSCRIBED')
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onDenied).not.toHaveBeenCalled()
    expect(mocks.read).toHaveBeenCalledOnce()
    expect(mocks.removeChannel).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses the newest realtime access window instead of a late read', async () => {
    const { check, onDenied } = start()
    let resolve!: (value: any) => void
    mocks.read.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = check()
    receive({ new: { ...active, access_end: new Date(Date.now() + 1000).toISOString() } })
    resolve({ data: active, error: null })
    await pending
    await vi.advanceTimersByTimeAsync(1001)
    expect(onDenied).toHaveBeenCalledWith('此帳號的可登入時間已結束。')
  })

  it('rejects a missing profile, but not incomplete realtime payloads', async () => {
    const { check, onDenied } = start()
    receive({ new: { id: 'user-1' } })
    expect(onDenied).not.toHaveBeenCalled()
    mocks.read.mockResolvedValueOnce({ data: null, error: null })
    await check()
    expect(onDenied).toHaveBeenCalledWith('此帳號已無法使用，請聯絡管理員。')
  })
})
