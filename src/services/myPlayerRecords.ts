import { supabase } from '@/services/supabase'
import type { MyPlayerMatchRecord, MyPlayerRecordMember } from '@/types/myPlayerRecords'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) {
    return [] as T[]
  }

  return Array.isArray(data) ? data : [data]
}

const normalizeMember = (row: any): MyPlayerRecordMember => ({
  member_id: String(row?.member_id || ''),
  name: String(row?.name || ''),
  role: row?.role ? String(row.role) : null,
  team_group: row?.team_group ? String(row.team_group) : null,
  status: row?.status ? String(row.status) : null,
  jersey_number: row?.jersey_number == null ? null : String(row.jersey_number),
  avatar_url: row?.avatar_url ? String(row.avatar_url) : null,
  is_linked: Boolean(row?.is_linked)
})

const normalizeMatchRecord = (row: any): MyPlayerMatchRecord => ({
  ...row,
  absent_players: Array.isArray(row?.absent_players) ? row.absent_players : [],
  lineup: Array.isArray(row?.lineup) ? row.lineup : [],
  current_lineup: Array.isArray(row?.current_lineup) ? row.current_lineup : [],
  inning_logs: Array.isArray(row?.inning_logs) ? row.inning_logs : [],
  batting_stats: Array.isArray(row?.batting_stats) ? row.batting_stats : [],
  pitching_stats: Array.isArray(row?.pitching_stats) ? row.pitching_stats : [],
  home_score: Number(row?.home_score || 0),
  opponent_score: Number(row?.opponent_score || 0)
})

export const listMyPlayerRecordMembers = async () => {
  const { data, error } = await supabase.rpc('list_my_player_record_members')

  if (error) {
    throw error
  }

  return unwrapRows<any>(data)
    .map(normalizeMember)
    .filter((member) => member.member_id && member.name)
}

export const getMyPlayerMatchRecords = async (memberId: string) => {
  const { data, error } = await supabase.rpc('get_my_player_match_records', {
    p_member_id: memberId
  })

  if (error) {
    throw error
  }

  return unwrapRows<any>(data).map(normalizeMatchRecord)
}
