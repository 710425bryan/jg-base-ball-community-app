import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { supabase } from '@/services/supabase'
import { usePermissionsStore } from '@/stores/permissions'
import { createNotificationFeedController, useNotificationFeed } from './useNotificationFeed'

vi.mock('@/services/supabase', () => ({ supabase: { rpc: vi.fn() } }))

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })

  return { promise, resolve }
}

describe('notification feed controller', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([{ actions: [] as string[] }, { actions: ['EDIT'] }])('filters old RPC training events without VIEW (%j)', async ({ actions }) => {
    setActivePinia(createPinia())
    const permissions = usePermissionsStore()
    permissions.currentRole = 'COMMITTEE'
    permissions.permissions = actions.map(action => ({ feature: 'training', action }))
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [
      { id: 'training', source: 'training', title: '特訓', body: '', created_at: '2026-10-11', link: '/training' },
      { id: 'dates', source: 'training_date', title: '日期', body: '', created_at: '2026-10-11', link: '/dashboard' },
    ], error: null } as any)
    const controller = createNotificationFeedController()
    await controller.loadNotificationFeed()
    expect(controller.notifications.value.map(note => note.source)).toEqual(['training_date'])
  })

  it('rechecks VIEW after an RPC resolves and removes training cached before revocation', async () => {
    setActivePinia(createPinia())
    const permissions = usePermissionsStore()
    permissions.currentRole = 'MEMBER'
    permissions.permissions = [{ feature: 'training', action: 'VIEW' }]
    const rows = [{ id: 'training', source: 'training', title: '特訓', body: '', created_at: '2026-10-11', link: '/training' }]
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: rows, error: null } as any)
    const controller = createNotificationFeedController()
    await controller.loadNotificationFeed()
    expect(controller.notifications.value).toHaveLength(1)

    const response = createDeferred<any>()
    vi.mocked(supabase.rpc).mockImplementationOnce(() => response.promise as any)
    const refresh = controller.loadNotificationFeed(10, { staleMs: 0 })
    permissions.permissions = []
    response.resolve({ data: rows, error: null })
    await refresh
    expect(controller.notifications.value).toEqual([])
  })

  it('preserves ADMIN training notifications without explicit VIEW permission rows', async () => {
    setActivePinia(createPinia())
    usePermissionsStore().currentRole = 'ADMIN'
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: [
      { id: 'training', source: 'training', title: '特訓', body: '', created_at: '2026-10-11', link: '/training' }
    ], error: null } as any)
    const controller = createNotificationFeedController()
    await controller.loadNotificationFeed()
    expect(controller.notifications.value.map(note => note.source)).toEqual(['training'])
  })

  it('immediately hides cached and locally inserted training notifications when VIEW is revoked', () => {
    setActivePinia(createPinia())
    const permissions = usePermissionsStore()
    permissions.currentRole = 'MEMBER'
    permissions.permissions = [{ feature: 'training', action: 'VIEW' }]
    const feed = useNotificationFeed()
    feed.resetNotificationFeed()
    vi.mocked(supabase.rpc).mockClear()
    feed.upsertNotification({ id: 'training:old', source: 'training', title: '特訓', body: '', createdAt: '2026-10-11', link: '/training', highlightMemberId: null })
    feed.upsertNotification({ id: 'training_date:1', source: 'training_date', title: '日期', body: '', createdAt: '2026-10-11', link: '/dashboard', highlightMemberId: null })
    expect(feed.notifications.value.map(note => note.source)).toEqual(['training', 'training_date'])

    permissions.permissions = []
    expect(feed.notifications.value.map(note => note.source)).toEqual(['training_date'])
    feed.upsertNotification({ id: 'training:late', source: 'training', title: '特訓', body: '', createdAt: '2026-10-12', link: '/training', highlightMemberId: null })
    expect(feed.notifications.value.map(note => note.source)).toEqual(['training_date'])
    expect(supabase.rpc).not.toHaveBeenCalled()
    feed.resetNotificationFeed()
  })

  it('coalesces mutations during a request into one sequential forced refresh', async () => {
    const initial = createDeferred<any[]>()
    const refreshed = createDeferred<any[]>()
    const fetcher = vi.fn().mockImplementationOnce(() => initial.promise).mockImplementationOnce(() => refreshed.promise)
    const controller = createNotificationFeedController(fetcher)
    const first = controller.loadNotificationFeed()
    const changed = controller.loadNotificationFeed(10, { force: true })
    const changedAgain = controller.loadNotificationFeed(10, { force: true })
    expect(fetcher).toHaveBeenCalledTimes(1)

    initial.resolve([{ id: 'old', source: 'coach_leave', title: 'revoked', body: '', created_at: '2026-10-09', link: '/coach-schedules' }])
    await flushPromises()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(controller.notifications.value).toEqual([])
    expect(controller.isLoading.value).toBe(true)
    refreshed.resolve([])
    await Promise.all([first, changed, changedAgain])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(controller.isLoading.value).toBe(false)
  })

  it('upgrades a pending background request once when the bell needs fee reminders', async () => {
    const background = createDeferred<any[]>()
    const fetcher = vi.fn().mockImplementationOnce(() => background.promise).mockResolvedValue([])
    const controller = createNotificationFeedController(fetcher)
    const first = controller.loadNotificationFeed()
    const open = controller.loadNotificationFeed(10, { includeFeeReminders: true })
    const openAgain = controller.loadNotificationFeed(10, { includeFeeReminders: true })
    expect(fetcher).toHaveBeenCalledTimes(1)
    background.resolve([])
    await Promise.all([first, open, openAgain])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenLastCalledWith(10, { includeFeeReminders: true })
    await controller.loadNotificationFeed(10, { includeFeeReminders: true, staleMs: 30_000 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('honors cache age and refreshes fee scope after a background-only refresh', async () => {
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const fetcher = vi.fn().mockResolvedValue([])
    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed(10, { includeFeeReminders: true })
    now += 29_000
    await controller.loadNotificationFeed(10, { staleMs: 30_000 })
    expect(fetcher).toHaveBeenCalledTimes(1)
    now += 1_001
    await controller.loadNotificationFeed(10, { staleMs: 30_000 })
    expect(fetcher).toHaveBeenCalledTimes(2)
    await controller.loadNotificationFeed(10, { includeFeeReminders: true })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('removes revoked coach-leave visibility on a normal expired-cache refresh', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce([{
      id: 'coach-leave', source: 'coach_leave', title: 'private', body: '', created_at: '2026-10-09', link: '/coach-schedules'
    }]).mockResolvedValueOnce([])
    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed()
    expect(controller.notifications.value).toHaveLength(1)
    await controller.loadNotificationFeed(10, { staleMs: 0 })
    expect(controller.notifications.value).toEqual([])
  })

  it('does not let a previous session response clear or populate a newer request', async () => {
    const oldRows = createDeferred<any[]>()
    const newRows = createDeferred<any[]>()
    const fetcher = vi.fn().mockImplementationOnce(() => oldRows.promise).mockImplementationOnce(() => newRows.promise)
    const controller = createNotificationFeedController(fetcher)
    const oldLoad = controller.loadNotificationFeed()
    const oldQueued = controller.loadNotificationFeed(10, { force: true })
    controller.resetNotificationFeed()
    const newLoad = controller.loadNotificationFeed()
    oldRows.resolve([{ id: 'old-user', source: 'coach_leave', title: 'private', body: '', created_at: '2026-10-09', link: '/coach-schedules' }])
    await Promise.all([oldLoad, oldQueued])
    expect(controller.isLoading.value).toBe(true)
    expect(controller.notifications.value).toEqual([])
    const sharedNewLoad = controller.loadNotificationFeed()
    expect(fetcher).toHaveBeenCalledTimes(2)
    newRows.resolve([])
    await Promise.all([newLoad, sharedNewLoad])
    expect(controller.isLoading.value).toBe(false)
  })

  it('releases failed requests without automatic retries and allows a later refresh', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue([])
    const controller = createNotificationFeedController(fetcher)
    await expect(controller.loadNotificationFeed()).rejects.toThrow('timeout')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(controller.isLoading.value).toBe(false)
    await controller.loadNotificationFeed()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('preserves a requested mutation refresh when the older request fails', async () => {
    let rejectInitial!: (error: Error) => void
    const initial = new Promise<any[]>((_, reject) => { rejectInitial = reject })
    const fetcher = vi.fn().mockImplementationOnce(() => initial).mockResolvedValue([])
    const controller = createNotificationFeedController(fetcher)
    const first = controller.loadNotificationFeed()
    const changed = controller.loadNotificationFeed(10, { force: true })
    rejectInitial(new Error('timeout'))
    await Promise.all([first, changed])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(controller.isLoaded.value).toBe(true)
    expect(controller.isLoading.value).toBe(false)
  })

  it('removes coach leave notifications after the server revokes visibility on a forced reload', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce([{
      id: 'coach_leave:leave-1:1:created', source: 'coach_leave', title: '教練請假',
      body: '10/03 上午', created_at: '2026-10-02T14:00:00Z',
      link: '/coach-schedules?month=2026-10', highlight_member_id: null
    }]).mockResolvedValueOnce([])
    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed()
    expect(controller.notifications.value[0]?.link).toBe('/coach-schedules?month=2026-10')
    await controller.loadNotificationFeed(10, { force: true })
    expect(controller.notifications.value).toEqual([])
  })
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
      link: '/calendar?match_id=match-1'
    })

    await controller.loadNotificationFeed(10, { force: true })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(controller.notifications.value[0]).toMatchObject({
      id: 'match:match-event-2',
      source: 'match',
      link: '/calendar?match_id=match-2'
    })
  })

  it('maps match reminder health alert notifications', async () => {
    const fetcher = vi.fn().mockResolvedValue([
      {
        id: 'match_reminder_health:missing_events:default:2026-07-04:20:00:admin-1',
        source: 'match',
        title: '賽事提醒排程異常',
        body: '原訂發送：2026-07-04 20:00',
        created_at: '2026-07-04T12:05:00.000Z',
        link: '/match-records',
        highlight_member_id: null
      }
    ])

    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed(10)

    expect(controller.notifications.value[0]).toMatchObject({
      id: 'match:match_reminder_health:missing_events:default:2026-07-04:20:00:admin-1',
      source: 'match',
      title: '賽事提醒排程異常',
      link: '/match-records'
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
        id: 'training_registration_selected:registration-1:user-1',
        source: 'training',
        title: '特訓課已錄取：五月特訓課',
        body: '球員：王小明',
        created_at: '2026-04-30T01:00:00.000Z',
        link: '/training?session_id=session-1',
        highlight_member_id: 'member-1'
      }
    ])

    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed(10)

    expect(controller.notifications.value[0]).toMatchObject({
      id: 'training:training_registration_selected:registration-1:user-1',
      source: 'training',
      link: '/training?session_id=session-1',
      highlightMemberId: 'member-1'
    })
  })

  it('maps training location notifications', async () => {
    const fetcher = vi.fn().mockResolvedValue([
      {
        id: 'training_location:session-1:user-1:2026-05-01T08:00:00.000Z',
        source: 'training_location',
        title: '訓練場地通知：2026-05-02 週六訓練',
        body: '王小明：中港國小',
        created_at: '2026-05-01T12:10:00.000Z',
        link: '/dashboard?training_date=2026-05-02',
        highlight_member_id: 'member-1'
      }
    ])

    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed(10)

    expect(controller.notifications.value[0]).toMatchObject({
      id: 'training_location:training_location:session-1:user-1:2026-05-01T08:00:00.000Z',
      source: 'training_location',
      link: '/dashboard?training_date=2026-05-02',
      highlightMemberId: 'member-1'
    })
  })

  it('maps training date notifications', async () => {
    const fetcher = vi.fn().mockResolvedValue([
      {
        id: 'training_dates:2026-05-01:user-1:2026-05-01T08:00:00.000Z',
        source: 'training_date',
        title: '訓練日期異動：2026 年 5 月',
        body: '本月訓練日：5/2 週六、5/9 週六',
        created_at: '2026-05-01T12:10:00.000Z',
        link: '/dashboard?training_month=2026-05',
        highlight_member_id: 'member-1'
      }
    ])

    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed(10)

    expect(controller.notifications.value[0]).toMatchObject({
      id: 'training_date:training_dates:2026-05-01:user-1:2026-05-01T08:00:00.000Z',
      source: 'training_date',
      link: '/dashboard?training_month=2026-05',
      highlightMemberId: 'member-1'
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

  it('maps targeted fee payment reminder notifications', async () => {
    const fetcher = vi.fn().mockResolvedValue([
      {
        id: 'fee_payment_reminder:user-1:2026-06:2026-Q3:community:2026-07-08',
        source: 'fee_payment_reminder',
        title: '繳費提醒',
        body: '王小明 的 2026-06 月費 尚未繳費，金額 $2,000。請至繳費資訊查看。',
        created_at: '2026-07-08T12:00:00.000Z',
        link: '/my-payments',
        highlight_member_id: 'member-1'
      }
    ])

    const controller = createNotificationFeedController(fetcher)
    await controller.loadNotificationFeed(10)

    expect(controller.notifications.value[0]).toMatchObject({
      id: 'fee_payment_reminder:fee_payment_reminder:user-1:2026-06:2026-Q3:community:2026-07-08',
      source: 'fee_payment_reminder',
      title: '繳費提醒',
      link: '/my-payments',
      highlightMemberId: 'member-1'
    })
  })
})
