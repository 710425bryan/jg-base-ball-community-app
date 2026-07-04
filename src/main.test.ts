// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mountMock = vi.hoisted(() => vi.fn())
const useMock = vi.hoisted(() => vi.fn(() => ({ use: useMock, mount: mountMock })))
const appMock = vi.hoisted(() => ({
  use: useMock,
  mount: mountMock
}))
const createAppMock = vi.hoisted(() => vi.fn(() => appMock))
const createPiniaMock = vi.hoisted(() => vi.fn(() => ({ name: 'pinia' })))
const routerMock = vi.hoisted(() => ({
  isReady: vi.fn().mockResolvedValue(undefined),
  currentRoute: {
    value: {
      fullPath: '/dashboard'
    }
  },
  push: vi.fn()
}))
const clearPendingPushDeepLinkTargetMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const consumePendingPushDeepLinkTargetMock = vi.hoisted(() => vi.fn().mockResolvedValue(null))
const normalizePushDeepLinkTargetMock = vi.hoisted(() => vi.fn((target: unknown) =>
  typeof target === 'string' && target ? target : '/dashboard'
))
const buildPushEntryHashMock = vi.hoisted(() => vi.fn((target: string) =>
  `#/push-entry?target=${encodeURIComponent(target)}`
))

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')

  return {
    ...actual,
    createApp: createAppMock
  }
})

vi.mock('pinia', () => ({
  createPinia: createPiniaMock
}))

vi.mock('@tanstack/vue-query', () => ({
  VueQueryPlugin: {
    install: vi.fn()
  }
}))

vi.mock('element-plus', () => ({
  default: {
    install: vi.fn()
  }
}))

vi.mock('element-plus/es/locale/lang/zh-tw', () => ({
  default: {
    name: 'zh-tw'
  }
}))

vi.mock('./App.vue', () => ({
  default: {
    name: 'App'
  }
}))

vi.mock('./router', () => ({
  default: routerMock
}))

vi.mock('@/utils/pushDeepLink', () => ({
  PUSH_ENTRY_ROUTE: '/push-entry',
  PUSH_NOTIFICATION_CLICK_MESSAGE: 'PUSH_NOTIFICATION_CLICK',
  buildPushEntryHash: buildPushEntryHashMock,
  clearPendingPushDeepLinkTarget: clearPendingPushDeepLinkTargetMock,
  consumePendingPushDeepLinkTarget: consumePendingPushDeepLinkTargetMock,
  normalizePushDeepLinkTarget: normalizePushDeepLinkTargetMock
}))

describe('main app entry', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="app"></div>'
    window.history.replaceState(null, '', '/')
  })

  it('installs the app plugins and mounts the app', async () => {
    await import('./main')

    expect(createAppMock).toHaveBeenCalledTimes(1)
    expect(createPiniaMock).toHaveBeenCalledTimes(1)
    expect(useMock).toHaveBeenCalledTimes(4)
    expect(mountMock).toHaveBeenCalledWith('#app')
  })

  it('rewrites an initial push target into the push entry hash and clears pending storage', async () => {
    window.history.replaceState(null, '', '/?push_target=/calendar?match_id=match-1')

    await import('./main')

    expect(normalizePushDeepLinkTargetMock).toHaveBeenCalledWith(
      '/calendar?match_id=match-1',
      window.location.origin
    )
    expect(buildPushEntryHashMock).toHaveBeenCalledWith('/calendar?match_id=match-1')
    expect(window.location.hash).toBe('#/push-entry?target=%2Fcalendar%3Fmatch_id%3Dmatch-1')
    expect(clearPendingPushDeepLinkTargetMock).toHaveBeenCalledTimes(1)
  })
})
