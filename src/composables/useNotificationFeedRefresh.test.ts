// @vitest-environment jsdom
import { defineComponent, effectScope, nextTick, reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNotificationFeedController } from './useNotificationFeed'
import { useNotificationFeedRefresh, watchNotificationFeedScope } from './useNotificationFeedRefresh'

describe('notification refresh triggers', () => {
  afterEach(() => vi.restoreAllMocks())

  it('defers hidden changes and forces one refresh on return despite a fresh cache', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let resolveRows!: (rows: any[]) => void
    const deferred = new Promise<any[]>(resolve => { resolveRows = resolve })
    const fetcher = vi.fn().mockResolvedValueOnce([{
      id: 'leave', source: 'coach_leave', title: 'private', body: '', created_at: '2026-10-09', link: '/coach-schedules'
    }]).mockImplementationOnce(() => deferred)
    const controller = createNotificationFeedController(fetcher)
    const load = vi.fn(controller.loadNotificationFeed)
    let refresh!: ReturnType<typeof useNotificationFeedRefresh>['refreshNotificationFeed']
    const wrapper = mount(defineComponent({ setup() {
      refresh = useNotificationFeedRefresh(() => true, load).refreshNotificationFeed
      return () => null
    } }))
    try {
      await refresh()
      expect(controller.notifications.value).toHaveLength(1)
      visibility.mockReturnValue('hidden')
      window.dispatchEvent(new Event('coach-leave-changed'))
      window.dispatchEvent(new Event('coach-leave-changed'))
      await refresh()
      await flushPromises()
      expect(fetcher).toHaveBeenCalledTimes(1)
      visibility.mockReturnValue('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(load.mock.calls.filter(([, options]) => options?.force)).toHaveLength(1)
      resolveRows([])
      await flushPromises()
      expect(controller.notifications.value).toEqual([])
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally { wrapper.unmount() }
  })

  it('does not reset or reschedule after last-seen-only profile replacement, but observes auth scope changes', async () => {
    const auth = reactive({ userId: 'user-a', profile: { id: 'user-a', role: 'COACH', last_seen_at: '' } })
    const permissions = reactive({ role: 'COACH', loading: false, signature: 'coach:VIEW' })
    const resetFeed = vi.fn()
    const scheduleFeed = vi.fn()
    const scope = effectScope()
    scope.run(() => watchNotificationFeedScope(() => ({
      userId: auth.userId, profileUserId: auth.profile.id, role: auth.profile.role,
      permissionRole: permissions.role, permissionsLoading: permissions.loading,
      permissionSignature: permissions.signature
    }), () => { resetFeed(); scheduleFeed() }))
    try {
      expect(resetFeed).toHaveBeenCalledTimes(1)
      auth.profile = { ...auth.profile, last_seen_at: '2026-10-09T05:00:00Z' }
      await nextTick()
      expect(resetFeed).toHaveBeenCalledTimes(1)
      expect(scheduleFeed).toHaveBeenCalledTimes(1)
      auth.profile = { ...auth.profile, role: 'MANAGER' }
      await nextTick()
      expect(resetFeed).toHaveBeenCalledTimes(2)
      auth.userId = 'user-b'
      await nextTick()
      expect(resetFeed).toHaveBeenCalledTimes(3)
      permissions.signature = 'coach:VIEW|coach:EDIT'
      await nextTick()
      expect(resetFeed).toHaveBeenCalledTimes(4)
      expect(scheduleFeed).toHaveBeenCalledTimes(4)
    } finally { scope.stop() }
  })

  it('shares foreground and bell requests, while mutations invalidate cached data', async () => {
    const fetcher = vi.fn().mockResolvedValue([])
    const controller = createNotificationFeedController(fetcher)
    let refresh!: ReturnType<typeof useNotificationFeedRefresh>['refreshNotificationFeed']
    const wrapper = mount(defineComponent({ setup() {
      refresh = useNotificationFeedRefresh(() => true, controller.loadNotificationFeed).refreshNotificationFeed
      return () => null
    } }))
    try {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      await flushPromises()
      expect(fetcher).toHaveBeenCalledTimes(1)
      await Promise.all([refresh('open'), refresh('open')])
      expect(fetcher).toHaveBeenCalledTimes(2)
      expect(fetcher).toHaveBeenLastCalledWith(10, { includeFeeReminders: true })
      window.dispatchEvent(new Event('focus'))
      await flushPromises()
      expect(fetcher).toHaveBeenCalledTimes(2)
      window.dispatchEvent(new Event('coach-leave-changed'))
      await flushPromises()
      expect(fetcher).toHaveBeenCalledTimes(3)
    } finally {
      wrapper.unmount()
    }
    window.dispatchEvent(new Event('coach-leave-changed'))
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('waits for authenticated permission hydration and handles fetch failures', async () => {
    let allowed = false
    const load = vi.fn().mockRejectedValue(new Error('timeout'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let refresh!: ReturnType<typeof useNotificationFeedRefresh>['refreshNotificationFeed']
    const wrapper = mount(defineComponent({ setup() {
      refresh = useNotificationFeedRefresh(() => allowed, load).refreshNotificationFeed
      return () => null
    } }))
    try {
      await refresh('changed')
      expect(load).not.toHaveBeenCalled()
      allowed = true
      await refresh('foreground')
      expect(load).toHaveBeenCalledWith(10, { force: true, includeFeeReminders: false, staleMs: 30_000 })
      expect(error).toHaveBeenCalledOnce()
      load.mockResolvedValue([])
      await refresh('foreground')
      expect(load).toHaveBeenLastCalledWith(10, { force: true, includeFeeReminders: false, staleMs: 30_000 })
    } finally {
      wrapper.unmount()
    }
  })
})
