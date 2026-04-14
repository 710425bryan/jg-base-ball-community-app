import { describe, expect, it, vi } from 'vitest'
import { createNotificationFeedController } from './useNotificationFeed'

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })

  return { promise, resolve }
}

describe('notification feed controller', () => {
  it('reuses the same in-flight request for delayed and manual loads', async () => {
    const deferredRows = createDeferred<any[]>()

    const fetcher = vi.fn(
      () => deferredRows.promise
    )

    const controller = createNotificationFeedController(fetcher)

    const delayedLoad = controller.loadNotificationFeed(10)
    const manualLoad = controller.loadNotificationFeed(10)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(controller.isLoading.value).toBe(true)

    deferredRows.resolve([
      {
        id: 'fee-1',
        source: 'fee',
        title: '通知標題',
        body: '通知內容',
        created_at: '2026-04-14T12:00:00.000Z',
        link: '/fees',
        highlight_member_id: 'member-1'
      }
    ])

    const [firstResult, secondResult] = await Promise.all([delayedLoad, manualLoad])

    expect(firstResult).toEqual(secondResult)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(controller.notifications.value).toEqual([
      {
        id: 'fee:fee-1',
        source: 'fee',
        title: '通知標題',
        body: '通知內容',
        createdAt: '2026-04-14T12:00:00.000Z',
        link: '/fees',
        highlightMemberId: 'member-1'
      }
    ])

    await controller.loadNotificationFeed(10)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
