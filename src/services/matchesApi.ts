import { supabase } from './supabase'
import type { MatchRecord, MatchRecordInput } from '../types/match'

let supportsGoogleCalendarEventIdColumn: boolean | null = null

const isMissingGoogleCalendarEventIdError = (error: any) => {
  const message = String(error?.message || '')
  return message.includes('google_calendar_event_id') && (
    message.includes('schema cache') ||
    message.includes('does not exist')
  )
}

const stripGoogleCalendarEventId = <T extends Partial<MatchRecordInput>>(payload: T): Omit<T, 'google_calendar_event_id'> => {
  const { google_calendar_event_id: _ignored, ...rest } = payload
  return rest
}

const withGoogleCalendarColumnFallback = async <T>(
  payload: Partial<MatchRecordInput>,
  run: (normalizedPayload: Partial<MatchRecordInput>) => Promise<{ data: T | null; error: any }>
) => {
  const initialPayload = supportsGoogleCalendarEventIdColumn === false
    ? stripGoogleCalendarEventId(payload)
    : payload

  let { data, error } = await run(initialPayload)

  if (error && isMissingGoogleCalendarEventIdError(error)) {
    supportsGoogleCalendarEventIdColumn = false
    console.warn('matches.google_calendar_event_id is unavailable; retrying without the sync column.')
    ;({ data, error } = await run(stripGoogleCalendarEventId(payload)))
  } else if (!error && 'google_calendar_event_id' in payload) {
    supportsGoogleCalendarEventIdColumn = true
  }

  if (error) throw error
  return data as T
}

export const matchesApi = {
  async getMatches() {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .order('match_date', { ascending: false })
      .order('match_time', { ascending: false })

    if (error) throw error
    return data as MatchRecord[]
  },

  async getMatch(id: string) {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    return data as MatchRecord
  },

  async createMatch(match: MatchRecordInput) {
    return withGoogleCalendarColumnFallback(match, async (normalizedMatch) => {
      const { data, error } = await supabase
        .from('matches')
        .insert([normalizedMatch])
        .select()
        .single()

      return {
        data: data as MatchRecord | null,
        error
      }
    })
  },

  async updateMatch(id: string, updates: Partial<MatchRecordInput>) {
    return withGoogleCalendarColumnFallback(updates, async (normalizedUpdates) => {
      const { data, error } = await supabase
        .from('matches')
        .update(normalizedUpdates)
        .eq('id', id)
        .select()
        .single()

      return {
        data: data as MatchRecord | null,
        error
      }
    })
  },

  async deleteMatch(id: string) {
    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}
