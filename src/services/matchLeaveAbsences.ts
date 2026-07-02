import { supabase } from './supabase'
import type { AbsentPlayer } from '@/types/match'
import { leaveTimeSegmentOverlapsEventTime, normalizeEventTimeText } from '@/utils/attendanceLeave'
import {
  createAbsentPlayerFromLeaveRow,
  type MatchLeaveAbsenceRow
} from '@/utils/matchLeaveAbsences'

const normalizePlayerNames = (playerNames: string[]) =>
  Array.from(
    new Set(
      playerNames
        .map((name) => String(name || '').trim())
        .filter(Boolean)
    )
  )

const normalizeRows = (
  rows: MatchLeaveAbsenceRow[] | null | undefined,
  eventTimeText?: string | null
): AbsentPlayer[] =>
  (Array.isArray(rows) ? rows : [])
    .filter((row) => leaveTimeSegmentOverlapsEventTime(row.leave_time_segment, eventTimeText))
    .map(createAbsentPlayerFromLeaveRow)
    .filter((player) => player.name)

export const previewMatchLeaveAbsences = async (
  matchDate: string,
  playerNames: string[],
  matchTime?: string | null
): Promise<AbsentPlayer[]> => {
  const normalizedPlayerNames = normalizePlayerNames(playerNames)
  if (!matchDate || !normalizedPlayerNames.length) return []
  const normalizedMatchTime = normalizeEventTimeText(matchTime) || String(matchTime || '').trim()

  const { data, error } = await supabase.rpc('preview_match_leave_absences', {
    p_match_date: matchDate,
    p_player_names: normalizedPlayerNames,
    p_match_time: normalizedMatchTime || null
  })

  if (error) throw error
  return normalizeRows(data as MatchLeaveAbsenceRow[] | null, normalizedMatchTime)
}

export const getMatchLeaveAbsences = async (matchId: string): Promise<AbsentPlayer[]> => {
  if (!matchId) return []

  const { data, error } = await supabase.rpc('get_match_leave_absences', {
    p_match_id: matchId
  })

  if (error) throw error
  return normalizeRows(data as MatchLeaveAbsenceRow[] | null)
}
