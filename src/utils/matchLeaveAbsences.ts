import type { AbsentPlayer } from '@/types/match'

export const MATCH_LEAVE_ABSENCE_SOURCE = 'leave_request'

export interface MatchLeaveAbsenceRow {
  member_id: string
  member_name: string
  leave_type: string | null
  start_date: string | null
  end_date: string | null
  leave_request_ids: string[] | null
}

const normalizeNameKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .replace(/[\s·‧・．.]/g, '')
    .trim()
    .toLowerCase()

const normalizeLeaveRequestIds = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

export const isLeaveRequestAbsentPlayer = (player: Partial<AbsentPlayer> | null | undefined) =>
  player?.source === MATCH_LEAVE_ABSENCE_SOURCE

export const createAbsentPlayerFromLeaveRow = (row: MatchLeaveAbsenceRow): AbsentPlayer => ({
  name: String(row.member_name || '').trim(),
  type: String(row.leave_type || '').trim() || '請假',
  source: MATCH_LEAVE_ABSENCE_SOURCE,
  member_id: row.member_id || null,
  leave_request_ids: normalizeLeaveRequestIds(row.leave_request_ids),
  start_date: row.start_date || null,
  end_date: row.end_date || row.start_date || null
})

export const getAbsentPlayerMergeKey = (player: Partial<AbsentPlayer> | null | undefined) => {
  if (!player) return ''
  const memberId = String(player.member_id || '').trim()
  if (memberId) return `member:${memberId}`
  const nameKey = normalizeNameKey(player.name)
  return nameKey ? `name:${nameKey}` : ''
}

export const withoutLeaveRequestAbsentPlayers = (players: AbsentPlayer[] | null | undefined) =>
  (Array.isArray(players) ? players : []).filter((player) => !isLeaveRequestAbsentPlayer(player))

export const mergeManualAndLeaveAbsences = (
  savedPlayers: AbsentPlayer[] | null | undefined,
  liveLeavePlayers: AbsentPlayer[] | null | undefined
) => {
  const manualPlayers = withoutLeaveRequestAbsentPlayers(savedPlayers)
  const manualKeys = new Set(manualPlayers.map(getAbsentPlayerMergeKey).filter(Boolean))
  const livePlayers = (Array.isArray(liveLeavePlayers) ? liveLeavePlayers : [])
    .filter(isLeaveRequestAbsentPlayer)
    .filter((player) => {
      const key = getAbsentPlayerMergeKey(player)
      return key && !manualKeys.has(key)
    })

  return [...manualPlayers, ...livePlayers]
}
