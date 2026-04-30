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

  it('maps training registration notifications', async () => {
    const fetcher = vi.fn().mockResolvedValue([
      {
        id: 'training_registration_open:session-1:2026-04-30T01:00:00.000Z',
        source: 'training',
        title: '特訓課開放報名：五月特訓課',
        body: '課程：五月特訓課',
        created_at: '2026-04-30T01:00:00.000Z',
        link: '/training?session_id=session-1',
        highlight_member_id: null
      }
    ])

    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed(10)

    expect(controller.notifications.value[0]).toMatchObject({
      id: 'training:training_registration_open:session-1:2026-04-30T01:00:00.000Z',
      source: 'training',
      link: '/training?session_id=session-1'
    })
  })

  it('maps fee management reminder notifications and keeps current todo ids stable', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce([
        {
          id: 'profile-payment-pending',
          source: 'fee',
          title: '個人付款待確認',
          body: '2 筆個人付款回報等待確認，合計 $3500。',
          created_at: '2026-04-29T08:00:00.000Z',
          link: '/fees?highlight_submission_id=submission-1',
          highlight_member_id: null
        },
        {
          id: 'equipment-payment-pending',
          source: 'equipment',
          title: '裝備付款待確認',
          body: '1 筆裝備付款回報等待確認，合計 $1200。',
          created_at: '2026-04-29T08:05:00.000Z',
          link: '/fees?tab=equipment&highlight_submission_id=equipment-payment-1',
          highlight_member_id: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'profile-payment-pending',
          source: 'fee',
          title: '個人付款待確認',
          body: '3 筆個人付款回報等待確認，合計 $4200。',
          created_at: '2026-04-29T09:00:00.000Z',
          link: '/fees?highlight_submission_id=submission-2',
          highlight_member_id: null
        }
      ])

    const controller = createNotificationFeedController(fetcher)

    await controller.loadNotificationFeed(10)
    await controller.loadNotificationFeed(10, { force: true })

    expect(controller.notifications.value).toEqual([
      {
        id: 'fee:profile-payment-pending',
        source: 'fee',
        title: '個人付款待確認',
        body: '3 筆個人付款回報等待確認，合計 $4200。',
        createdAt: '2026-04-29T09:00:00.000Z',
        link: '/fees?highlight_submission_id=submission-2',
        highlightMemberId: null
      },
      {
        id: 'equipment:equipment-payment-pending',
        source: 'equipment',
        title: '裝備付款待確認',
        body: '1 筆裝備付款回報等待確認，合計 $1200。',
        createdAt: '2026-04-29T08:05:00.000Z',
        link: '/fees?tab=equipment&highlight_submission_id=equipment-payment-1',
        highlightMemberId: null
      }
    ])
  })
})
