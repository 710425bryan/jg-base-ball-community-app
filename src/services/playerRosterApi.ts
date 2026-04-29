import { supabase } from '@/services/supabase'

export type PlayerRosterSourceScope = 'full' | 'safe'

export interface PlayerRosterCacheMeta {
  row_count: number
  latest_changed_at: string | null
}

const normalizeMetaRow = (row: any): PlayerRosterCacheMeta => ({
  row_count: Number(row?.row_count || 0),
  latest_changed_at: row?.latest_changed_at ? String(row.latest_changed_at) : null
})

export const fetchPlayerRosterRows = async (sourceScope: PlayerRosterSourceScope) => {
  const sourceTable = sourceScope === 'full' ? 'team_members' : 'team_members_safe'
  const { data, error } = await supabase
    .from(sourceTable)
    .select('*')
    .order('role')
    .order('name')

  if (error) throw error
  return data || []
}

export const fetchPlayerRosterMeta = async (): Promise<PlayerRosterCacheMeta> => {
  const { data, error } = await supabase.rpc('get_team_members_cache_meta')

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  return normalizeMetaRow(row)
}
