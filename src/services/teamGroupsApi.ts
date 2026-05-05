import { supabase } from '@/services/supabase'
import type { DeleteTeamGroupResult, TeamGroupSetting } from '@/types/teamGroup'

const normalizeTeamGroupSetting = (row: any): TeamGroupSetting => ({
  id: String(row?.id || ''),
  name: String(row?.name || ''),
  sort_order: Number(row?.sort_order || 0),
  member_count: Number(row?.member_count || 0),
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null
})

const normalizeDeleteResult = (row: any): DeleteTeamGroupResult => ({
  deleted_name: String(row?.deleted_name || ''),
  transferred_to_name: row?.transferred_to_name ? String(row.transferred_to_name) : null,
  transferred_member_count: Number(row?.transferred_member_count || 0)
})

const unwrapFirstRow = <T>(data: T[] | T | null | undefined): T | null => {
  if (!data) return null
  return Array.isArray(data) ? data[0] || null : data
}

export const fetchTeamGroupSettings = async () => {
  const { data, error } = await supabase.rpc('list_team_group_settings')
  if (error) throw error
  return (Array.isArray(data) ? data : []).map(normalizeTeamGroupSetting)
}

export const createTeamGroupSetting = async (name: string) => {
  const { data, error } = await supabase.rpc('create_team_group_setting', {
    p_name: name
  })
  if (error) throw error
  return normalizeTeamGroupSetting(unwrapFirstRow(data))
}

export const updateTeamGroupSetting = async (id: string, name: string) => {
  const { data, error } = await supabase.rpc('update_team_group_setting', {
    p_id: id,
    p_name: name
  })
  if (error) throw error
  return normalizeTeamGroupSetting(unwrapFirstRow(data))
}

export const deleteTeamGroupSetting = async (id: string, transferToId?: string | null) => {
  const { data, error } = await supabase.rpc('delete_team_group_setting', {
    p_id: id,
    p_transfer_to_id: transferToId || null
  })
  if (error) throw error
  return normalizeDeleteResult(unwrapFirstRow(data))
}

export const reorderTeamGroupSettings = async (groupIds: string[]) => {
  const { data, error } = await supabase.rpc('reorder_team_group_settings', {
    p_group_ids: groupIds
  })
  if (error) throw error
  return (Array.isArray(data) ? data : []).map(normalizeTeamGroupSetting)
}
