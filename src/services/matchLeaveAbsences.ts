import { supabase } from './supabase'
import type { AbsentPlayer } from '@/types/match'
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

const normalizeRows = (rows: MatchLeaveAbsenceRow[] | null | undefined): AbsentPlayer[] =>
  (Array.isArray(rows) ? rows : [])
    .map(createAbsentPlayerFromLeaveRow)
    .filter((player) => player.name)

export const previewMatchLeaveAbsences = async (
  matchDate: string,
  playerNames: string[]
): Promise<AbsentPlayer[]> => {
  const normalizedPlayerNames = normalizePlayerNames(playerNames)
  if (!matchDate || !normalizedPlayerNames.length) return []

  const { data, error } = await supabase.rpc('preview_match_leave_absences', {
    p_match_date: matchDate,
    p_player_names: normalizedPlayerNames
  })

  if (error) throw error
  return normalizeRows(data as MatchLeaveAbsenceRow[] | null)
}

export const getMatchLeaveAbsences = async (matchId: string): Promise<AbsentPlayer[]> => {
  if (!matchId) return []

  const { data, error } = await supabase.rpc('get_match_leave_absences', {
    p_match_id: matchId
  })

  if (error) throw error
  return normalizeRows(data as MatchLeaveAbsenceRow[] | null)
}
