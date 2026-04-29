import { supabase } from './supabase'
import type { MatchAudioRosterPlayer, MatchAudioTranscriptionResult } from '@/utils/matchAudioTranscription'
import { normalizeMatchAudioStructuredResult } from '@/utils/matchAudioTranscription'

interface TranscribeMatchAudioInput {
  audioBlob: Blob
  chunks?: Blob[]
  mimeType: string
  inning: string
  matchContext: {
    matchId?: string | null
    matchName?: string | null
    opponent?: string | null
    matchDate?: string | null
    batFirst?: boolean | null
    isOffensiveHalf?: boolean | null
  }
  roster: MatchAudioRosterPlayer[]
}

interface RawTranscribeMatchAudioResponse {
  transcript?: string | null
  result?: unknown
}

const MAX_SINGLE_AUDIO_UPLOAD_BYTES = 24 * 1024 * 1024

const getAudioExtension = (mimeType: string) => {
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('mpeg')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

export const transcribeMatchAudio = async ({
  audioBlob,
  chunks = [],
  mimeType,
  inning,
  matchContext,
  roster,
}: TranscribeMatchAudioInput): Promise<MatchAudioTranscriptionResult> => {
  const formData = new FormData()
  const extension = getAudioExtension(mimeType)

  formData.append('metadata', JSON.stringify({
    inning,
    matchContext,
    roster,
  }))

  if (audioBlob.size <= MAX_SINGLE_AUDIO_UPLOAD_BYTES || chunks.length === 0) {
    formData.append('audio', audioBlob, `match-${inning}.${extension}`)
  } else {
    chunks.forEach((chunk, index) => {
      formData.append('audio_chunks', chunk, `match-${inning}-${String(index + 1).padStart(3, '0')}.${extension}`)
    })
  }

  const { data, error } = await supabase.functions.invoke<RawTranscribeMatchAudioResponse>(
    'transcribe-match-audio',
    { body: formData }
  )

  if (error) throw error

  return normalizeMatchAudioStructuredResult({
    structuredResult: data?.result as any,
    roster,
    transcript: data?.transcript,
  })
}
