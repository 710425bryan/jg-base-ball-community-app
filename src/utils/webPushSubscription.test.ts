import { describe, expect, it, vi } from 'vitest'
import { decodeWebPushPublicKey, ensureCurrentWebPushSubscription, hasCurrentWebPushKey } from './webPushSubscription'

const publicKey = 'AQIDBA'
const subscription = (key: number[] | null) => ({
  options: { applicationServerKey: key ? Uint8Array.from(key).buffer : null },
  unsubscribe: vi.fn().mockResolvedValue(true)
}) as unknown as PushSubscription

describe('webPushSubscription key rotation', () => {
  it('decodes url-safe keys and recognizes the matching current application key', () => {
    expect([...decodeWebPushPublicKey('_-4')]).toEqual([255, 238])
    expect(hasCurrentWebPushKey(subscription([1, 2, 3, 4]), publicKey)).toBe(true)
    expect(hasCurrentWebPushKey(subscription([1, 2, 3]), publicKey)).toBe(false)
    expect(hasCurrentWebPushKey(subscription([4, 3, 2, 1]), publicKey)).toBe(false)
    expect(hasCurrentWebPushKey(subscription(null), publicKey)).toBe(false)
  })

  it('keeps an existing current-key subscription without requesting another one', async () => {
    const current = subscription([1, 2, 3, 4])
    const manager = { getSubscription: vi.fn().mockResolvedValue(current), subscribe: vi.fn() }
    expect(await ensureCurrentWebPushSubscription(manager, publicKey)).toBe(current)
    expect(current.unsubscribe).not.toHaveBeenCalled()
    expect(manager.subscribe).not.toHaveBeenCalled()
  })

  it.each([{ key: [9, 9] }, { key: null }])('replaces an obsolete or unidentifiable subscription in order ($key)', async ({ key }) => {
    const old = subscription(key)
    const next = subscription([1, 2, 3, 4])
    const calls: string[] = []
    vi.mocked(old.unsubscribe).mockImplementation(async () => { calls.push('unsubscribe'); return true })
    const manager = {
      getSubscription: vi.fn().mockResolvedValue(old),
      subscribe: vi.fn().mockImplementation(async () => { calls.push('subscribe'); return next })
    }
    expect(await ensureCurrentWebPushSubscription(manager, publicKey)).toBe(next)
    expect(calls).toEqual(['unsubscribe', 'subscribe'])
    expect(manager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3, 4]) })
  })

  it('does not attempt a conflicting subscribe if unsubscribe fails', async () => {
    const old = subscription([9])
    vi.mocked(old.unsubscribe).mockResolvedValue(false)
    const manager = { getSubscription: vi.fn().mockResolvedValue(old), subscribe: vi.fn() }
    await expect(ensureCurrentWebPushSubscription(manager, publicKey)).rejects.toThrow('舊推播訂閱解除失敗')
    expect(manager.subscribe).not.toHaveBeenCalled()
  })

  it('creates a subscription if none exists and propagates browser failures', async () => {
    const manager = { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn().mockRejectedValue(new Error('denied')) }
    await expect(ensureCurrentWebPushSubscription(manager, publicKey)).rejects.toThrow('denied')
    expect(manager.subscribe).toHaveBeenCalledTimes(1)
  })
})
