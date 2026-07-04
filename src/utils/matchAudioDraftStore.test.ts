import { afterEach, describe, expect, it, vi } from 'vitest'

describe('matchAudioDraftStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses crypto.randomUUID when available', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'draft-uuid')
    })

    const { createMatchAudioDraftId } = await import('./matchAudioDraftStore')

    expect(createMatchAudioDraftId()).toBe('draft-uuid')
  })

  it('falls back to a timestamp id when randomUUID is unavailable', async () => {
    vi.stubGlobal('crypto', {})
    vi.spyOn(Date, 'now').mockReturnValue(123456)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const { createMatchAudioDraftId } = await import('./matchAudioDraftStore')

    expect(createMatchAudioDraftId()).toMatch(/^audio-123456-/)
  })

  it('rejects opening the database when IndexedDB is unavailable', async () => {
    const { openMatchAudioDb } = await import('./matchAudioDraftStore')

    await expect(openMatchAudioDb()).rejects.toThrow('此瀏覽器不支援本機錄音暫存')
  })
})
