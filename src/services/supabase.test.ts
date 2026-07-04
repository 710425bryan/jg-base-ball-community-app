// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const createdSupabaseClients = vi.hoisted(() => [] as Array<{
  auth: {
    stopAutoRefresh: ReturnType<typeof vi.fn>
    startAutoRefresh: ReturnType<typeof vi.fn>
  }
}>)
const createClientMock = vi.hoisted(() => vi.fn(() => {
  const client = {
    auth: {
      stopAutoRefresh: vi.fn(),
      startAutoRefresh: vi.fn()
    }
  }

  createdSupabaseClients.push(client)
  return client
}))
const consoleWarnMock = vi.hoisted(() => vi.fn())

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}))

describe('supabase client bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    createdSupabaseClients.length = 0
    vi.spyOn(console, 'warn').mockImplementation(consoleWarnMock)
  })

  it('creates a passkey-enabled Supabase client with auth persistence', async () => {
    const module = await import('./supabase')

    expect(module.supabase).toBe(createdSupabaseClients[0])
    expect(createClientMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          experimental: {
            passkey: true
          }
        })
      })
    )
  })

  it('pauses and resumes auth auto refresh when document visibility changes', async () => {
    await import('./supabase')
    const client = createdSupabaseClients[0]

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(client.auth.stopAutoRefresh).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(client.auth.startAutoRefresh).toHaveBeenCalledTimes(1)
  })
})
