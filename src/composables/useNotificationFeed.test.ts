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

  it('maps match notifications and supports force reload', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce([
        {
          id: 'match-event-1',
          source: 'match',
          title: '明日賽事提醒：春季聯賽',
          body: '賽事名稱：春季聯賽',
          created_at: '2026-04-14T12:00:00.000Z',
          link: '/match-records?match_id=match-1',
          highlight_member_id: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'match-event-2',
          source: 'match',
          title: '明日賽事提醒：邀請賽',
          body: '賽事名稱：邀請賽',
          created_at: '2026-04-14T13:00:00.000Z',
          link: '/match-records?match_id=match-2',
          highlight_member_id: null
        }
      ])

    const controller = createNotificationFeedController(fetcher)

    await controller.loadNotificationFeed(10)
    await controller.loadNotificationFeed(10)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(controller.notifications.value[0]).toMatchObject({
      id: 'match:match-event-1',
      source: 'match',
      link: '/match-records?match_id=match-1'
    })

    await controller.loadNotificationFeed(10, { force: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(controller.notifications.value[0]).toMatchObject({
      id: 'match:match-event-2',
      source: 'match',
      link: '/match-records?match_id=match-2'
    })
  })

  it('maps announcement notifications', async () => {
    const fetcher = vi.fn().mockResolvedValue([
      {
        id: 'announcement_manual:announcement-1:1760000000000',
        source: 'announcement',
        title: '[系統公告] 練球時間調整',
        body: '本週練球時間調整為上午。',
        created_at: '2026-04-14T14:00:00.000Z',
        link: '/announcements?highlight_announcement_id=announcement-1',
        highlight_member_id: null
      }
    ])

    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed(10)

    expect(controller.notifications.value[0]).toMatchObject({
      id: 'announcement:announcement_manual:announcement-1:1760000000000',
      source: 'announcement',
      link: '/announcements?highlight_announcement_id=announcement-1'
    })
  })

  it('maps equipment purchase request notifications', async () => {
    const fetcher = vi.fn().mockResolvedValue([
      {
        id: 'equipment-request-1',
        source: 'equipment',
        title: '收到裝備加購申請',
        body: '小明 送出 2 項裝備加購申請。',
        created_at: '2026-04-14T15:00:00.000Z',
        link: '/fees?tab=equipment&highlight_id=equipment-request-1',
        highlight_member_id: 'member-1'
      }
    ])

    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed(10)

    expect(controller.notifications.value[0]).toMatchObject({
      id: 'equipment:equipment-request-1',
      source: 'equipment',
      link: '/fees?tab=equipment&highlight_id=equipment-request-1',
      highlightMemberId: 'member-1'
    })
  })
})
