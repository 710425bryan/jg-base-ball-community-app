import { supabase } from './supabase'
import type { MatchRecord, MatchRecordInput } from '../types/match'

let supportsGoogleCalendarEventIdColumn: boolean | null = null

const MATCH_RECORD_SELECT = `
  id,
  google_calendar_event_id,
  match_name,
  opponent,
  match_date,
  match_time,
  location,
  category_group,
  match_level,
  tournament_name,
  home_score,
  opponent_score,
  coaches,
  players,
  absent_players,
  note,
  photo_url,
  lineup,
  current_lineup,
  inning_logs,
  batting_stats,
  pitching_stats,
  current_batter_name,
  current_inning,
  current_b,
  current_s,
  current_o,
  base_1,
  base_2,
  base_3,
  bat_first,
  show_lineup_intro,
  show_line_score,
  show_3d_field,
  line_score_data,
  locked_by_user_id,
  locked_by_user_name,
  locked_at,
  created_at,
  updated_at
`

const MATCH_SUMMARY_SELECT = `
  id,
  google_calendar_event_id,
  match_name,
  opponent,
  match_date,
  match_time,
  location,
  category_group,
  match_level,
  tournament_name,
  home_score,
  opponent_score,
  coaches,
  players,
  photo_url,
  created_at,
  updated_at
`

const MATCH_RECORD_SELECT_WITHOUT_SYNC_COLUMN = MATCH_RECORD_SELECT.replace('  google_calendar_event_id,\n', '')
const MATCH_SUMMARY_SELECT_WITHOUT_SYNC_COLUMN = MATCH_SUMMARY_SELECT.replace('  google_calendar_event_id,\n', '')

const getMatchRecordSelect = () =>
  supportsGoogleCalendarEventIdColumn === false
    ? MATCH_RECORD_SELECT_WITHOUT_SYNC_COLUMN
    : MATCH_RECORD_SELECT

const getMatchSummarySelect = () =>
  supportsGoogleCalendarEventIdColumn === false
    ? MATCH_SUMMARY_SELECT_WITHOUT_SYNC_COLUMN
    : MATCH_SUMMARY_SELECT

const normalizeMatchRecord = (row: any): MatchRecord => ({
  ...row,
  absent_players: Array.isArray(row?.absent_players) ? row.absent_players : [],
  lineup: Array.isArray(row?.lineup) ? row.lineup : [],
  current_lineup: Array.isArray(row?.current_lineup) ? row.current_lineup : [],
  inning_logs: Array.isArray(row?.inning_logs) ? row.inning_logs : [],
  batting_stats: Array.isArray(row?.batting_stats) ? row.batting_stats : [],
  pitching_stats: Array.isArray(row?.pitching_stats) ? row.pitching_stats : []
})

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

const withGoogleCalendarSelectFallback = async <T>(
  run: () => Promise<{ data: T | null; error: any }>
) => {
  let { data, error } = await run()

  if (error && isMissingGoogleCalendarEventIdError(error)) {
    supportsGoogleCalendarEventIdColumn = false
    console.warn('matches.google_calendar_event_id is unavailable; retrying select without the sync column.')
    ;({ data, error } = await run())
  } else if (!error) {
    supportsGoogleCalendarEventIdColumn = true
  }

  if (error) throw error
  return data as T
}

export const matchesApi = {
  async getMatches() {
    return matchesApi.listMatchesForAdmin()
  },

  async listMatchesForAdmin() {
    const data = await withGoogleCalendarSelectFallback<any[]>(async () =>
      await supabase
        .from('matches')
        .select(getMatchRecordSelect())
        .order('match_date', { ascending: false })
        .order('match_time', { ascending: false })
    )

    return (data || []).map(normalizeMatchRecord)
  },

  async listUpcomingMatches(limit = 8, fromDate?: string | null) {
    const data = await withGoogleCalendarSelectFallback<any[]>(async () =>
      await supabase
        .from('matches')
        .select(getMatchSummarySelect())
        .gte('match_date', fromDate || new Date().toISOString().slice(0, 10))
        .order('match_date', { ascending: true })
        .order('match_time', { ascending: true })
        .limit(Math.max(1, Math.min(limit, 50)))
    )

    return (data || []).map(normalizeMatchRecord)
  },

  async listRecentMatches(limit = 4, beforeDate?: string | null) {
    const data = await withGoogleCalendarSelectFallback<any[]>(async () =>
      await supabase
        .from('matches')
        .select(getMatchSummarySelect())
        .lt('match_date', beforeDate || new Date().toISOString().slice(0, 10))
        .order('match_date', { ascending: false })
        .order('match_time', { ascending: false })
        .limit(Math.max(1, Math.min(limit, 50)))
    )

    return (data || []).map(normalizeMatchRecord)
  },

  async getMatch(id: string) {
    const data = await withGoogleCalendarSelectFallback<any>(async () =>
      await supabase
        .from('matches')
        .select(getMatchRecordSelect())
        .eq('id', id)
        .single()
    )

    return normalizeMatchRecord(data)
  },

  async createMatch(match: MatchRecordInput) {
    return withGoogleCalendarColumnFallback(match, async (normalizedMatch) => {
      const { data, error } = await supabase
        .from('matches')
        .insert([normalizedMatch])
        .select(getMatchRecordSelect())
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
        .select(getMatchRecordSelect())
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
