import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    functions: {
      invoke: invokeMock
    }
  }
}))

describe('matchAudioApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends one audio blob with metadata to the transcription Edge Function', async () => {
    invokeMock.mockResolvedValue({
      data: {
        transcript: '小明 一安',
        result: {
          events: [{ player_name: '小明', action: '一安' }],
          summary: '一支安打'
        }
      },
      error: null
    })

    const { transcribeMatchAudio } = await import('./matchAudioApi')
    const result = await transcribeMatchAudio({
      audioBlob: new Blob(['audio'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      inning: '1上',
      matchContext: { matchId: 'match-1', matchName: '友誼賽' },
      roster: [{ name: '小明', number: '7' }]
    })

    const body = invokeMock.mock.calls[0]?.[1]?.body as FormData
    const metadata = JSON.parse(String(body.get('metadata')))
    const audio = body.get('audio') as File

    expect(invokeMock).toHaveBeenCalledWith('transcribe-match-audio', {
      body: expect.any(FormData)
    })
    expect(metadata).toMatchObject({
      inning: '1上',
      matchContext: { matchId: 'match-1' },
      roster: [{ name: '小明', number: '7' }]
    })
    expect(audio.name).toBe('match-1上.webm')
    expect(result).toMatchObject({
      transcript: '小明 一安',
      suggestedLog: '小明 一安',
      summary: '一支安打'
    })
  })

  it('sends chunked audio when the combined recording is too large', async () => {
    invokeMock.mockResolvedValue({
      data: { transcript: '原文', result: { events: [] } },
      error: null
    })

    const { transcribeMatchAudio } = await import('./matchAudioApi')
    await transcribeMatchAudio({
      audioBlob: new Blob([new Uint8Array(24 * 1024 * 1024 + 1)], { type: 'audio/mp4' }),
      chunks: [
        new Blob(['a'], { type: 'audio/mp4' }),
        new Blob(['b'], { type: 'audio/mp4' })
      ],
      mimeType: 'audio/mp4',
      inning: '2下',
      matchContext: {},
      roster: []
    })

    const body = invokeMock.mock.calls[0]?.[1]?.body as FormData
    expect(body.get('audio')).toBeNull()
    expect(body.getAll('audio_chunks').map((file) => (file as File).name)).toEqual([
      'match-2下-001.mp4',
      'match-2下-002.mp4'
    ])
  })
})
