import { supabase } from './supabase'
import type { MatchRecord, MatchRecordInput } from '../types/match'

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
    const { data, error } = await supabase
      .from('matches')
      .insert([match])
      .select()
      .single()

    if (error) throw error
    return data as MatchRecord
  },

  async updateMatch(id: string, updates: Partial<MatchRecordInput>) {
    const { data, error } = await supabase
      .from('matches')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as MatchRecord
  },

  async deleteMatch(id: string) {
    const { error } = await supabase
      .from('matches')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}
