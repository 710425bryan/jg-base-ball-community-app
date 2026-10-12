import type { MatchRecord } from '@/types/match'

export const DEFAULT_MATCH_COVER = '/images/match-default-cover.webp'

export const getMatchGatherTime = (match: Pick<MatchRecord, 'note'>): string => {
  // Keep each value on its own line so an empty field cannot consume the next note.
  const line = String(match.note || '').split(/\r?\n/).find((value) => /^\s*集合時間\s*[:：]/.test(value))
  return line?.replace(/^\s*集合時間\s*[:：][ \t]*/, '').trim() || ''
}

export const isMatchCancelled = (match: { cancelled_at?: string | null }): boolean =>
  Boolean(match.cancelled_at)

export const getMatchMapsUrl = (location?: string): string => {
  const value = location?.trim()
  return value ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}` : ''
}
