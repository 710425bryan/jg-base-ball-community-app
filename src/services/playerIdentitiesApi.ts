import { supabase } from '@/services/supabase'
import { isCustomPlayerIdentity, normalizePlayerIdentity } from '@/utils/playerIdentity'

export const fetchPlayerIdentityLabels = async (): Promise<string[]> => {
  const { data, error } = await supabase.from('player_identity_labels').select('name').order('name')
  if (error) throw error
  return Array.from(new Set((data || []).map(row => normalizePlayerIdentity(row.name)).filter(isCustomPlayerIdentity)))
}
