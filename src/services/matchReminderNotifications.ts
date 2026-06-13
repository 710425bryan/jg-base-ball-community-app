import { supabase } from '@/services/supabase'

export type MatchReminderDispatchResult = {
  success?: boolean
  dry_run?: boolean
  target_date?: string | null
  target_match_id?: string | null
  match_count?: number
  active_user_count?: number
  total_targets?: number
  created_count?: number
  duplicate_count?: number
  dispatched_count?: number
  expired_count?: number
  failed_count?: number
  provider_counts?: Record<string, number>
  matches?: Array<Record<string, unknown>>
}

export const sendMatchReminderNotification = async (matchId: string) => {
  const normalizedMatchId = matchId.trim()
  if (!normalizedMatchId) {
    throw new Error('缺少比賽 ID')
  }

  const { data, error } = await supabase.functions.invoke<MatchReminderDispatchResult>(
    'send-match-reminders',
    {
      body: {
        match_id: normalizedMatchId,
        source: 'manual'
      }
    }
  )

  if (error) {
    throw error
  }

  return data
}
