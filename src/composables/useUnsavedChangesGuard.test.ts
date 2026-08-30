// @vitest-environment jsdom

import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  confirmActiveUnsavedChanges,
  runWithUnsavedChangesConfirmation,
  useUnsavedChangesGuard,
  withUnsavedChangesNavigationBypass
} from './useUnsavedChangesGuard'

const mountedWrappers: Array<ReturnType<typeof mount>> = []

afterEach(() => {
  mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
})

const mountGuardHarness = async (
  dirty: boolean,
  confirmDiscard = vi.fn(async () => false),
  options: { withPreviousHistory?: boolean } = {}
) => {
  const isDirty = ref(dirty)
  const guarded = defineComponent({
    setup() {
      useUnsavedChangesGuard({ isDirty, confirmDiscard })
      return { isDirty }
    },
    template: '<div>guarded</div>'
  })
  const target = defineComponent({ template: '<div>target</div>' })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: guarded },
      { path: '/target', component: target }
    ]
  })
  if (options.withPreviousHistory) {
    await router.push('/target')
  }
  await router.push('/')
  await router.isReady()
  const wrapper = mount(RouterView, { global: { plugins: [router] } })
  mountedWrappers.push(wrapper)
  await flushPromises()

  return { confirmDiscard, isDirty, router, wrapper }
}

describe('useUnsavedChangesGuard', () => {
  it('allows route navigation and beforeunload when the draft is empty', async () => {
    const { confirmDiscard, router } = await mountGuardHarness(false)
    const event = new Event('beforeunload', { cancelable: true })

    window.dispatchEvent(event)
    await router.push('/target')

    expect(event.defaultPrevented).toBe(false)
    expect(router.currentRoute.value.path).toBe('/target')
    expect(confirmDiscard).not.toHaveBeenCalled()
  })

  it('cancels or allows links and programmatic navigation through one route guard', async () => {
    const confirmDiscard = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { router } = await mountGuardHarness(true, confirmDiscard)

    await router.push('/target')
    expect(router.currentRoute.value.path).toBe('/')

    await router.push('/target')
    expect(router.currentRoute.value.path).toBe('/target')

    expect(confirmDiscard).toHaveBeenCalledTimes(2)
  })

  it('intercepts browser back navigation while the guarded page is active', async () => {
    const confirmDiscard = vi.fn(async () => false)
    const { router } = await mountGuardHarness(true, confirmDiscard, { withPreviousHistory: true })

    await router.back()
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
    expect(confirmDiscard).toHaveBeenCalledOnce()
  })

  it('uses the native beforeunload contract only while dirty', async () => {
    const { isDirty } = await mountGuardHarness(true)
    const blockedEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(blockedEvent)
    expect(blockedEvent.defaultPrevented).toBe(true)

    isDirty.value = false
    const allowedEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(allowedEvent)
    expect(allowedEvent.defaultPrevented).toBe(false)
  })

  it('shares the active confirmation with logout and supports a one-time navigation bypass', async () => {
    const confirmDiscard = vi.fn(async () => true)
    const { router } = await mountGuardHarness(true, confirmDiscard)

    expect(await confirmActiveUnsavedChanges()).toBe(true)
    await withUnsavedChangesNavigationBypass(async () => {
      await router.push('/target')
    })

    expect(confirmDiscard).toHaveBeenCalledOnce()
    expect(router.currentRoute.value.path).toBe('/target')
  })

  it('deduplicates simultaneous confirmation requests', async () => {
    let resolveDiscard!: (value: boolean) => void
    const confirmDiscard = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveDiscard = resolve
    }))
    await mountGuardHarness(true, confirmDiscard)

    const first = confirmActiveUnsavedChanges()
    const second = confirmActiveUnsavedChanges()
    expect(confirmDiscard).toHaveBeenCalledOnce()

    resolveDiscard(false)
    await expect(Promise.all([first, second])).resolves.toEqual([false, false])
  })

  it('does not run logout when discard is cancelled', async () => {
    await mountGuardHarness(true, vi.fn(async () => false))
    const signOut = vi.fn(async () => {})

    await expect(runWithUnsavedChangesConfirmation(signOut)).resolves.toBe(false)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('asks once, runs logout under bypass, and leaves the draft active if logout fails', async () => {
    const confirmDiscard = vi.fn(async () => true)
    await mountGuardHarness(true, confirmDiscard)
    const signOutFailure = new Error('sign out failed')
    const signOut = vi.fn(async () => {
      throw signOutFailure
    })

    await expect(runWithUnsavedChangesConfirmation(signOut)).rejects.toBe(signOutFailure)
    expect(confirmDiscard).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledOnce()

    await expect(confirmActiveUnsavedChanges()).resolves.toBe(true)
    expect(confirmDiscard).toHaveBeenCalledTimes(2)
  })
})
