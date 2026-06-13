import { supabase } from '@/services/supabase'
import {
  normalizeMatchReminderScheduleConfig,
  validateMatchReminderScheduleConfig,
  type DueMatchReminderScheduleRule,
  type MatchReminderScheduleConfig
} from '@/utils/matchReminderSchedule'

export type MatchReminderDispatchResult = {
  success?: boolean
  dry_run?: boolean
  target_date?: string | null
  target_dates?: string[]
  target_match_id?: string | null
  rule_count?: number
  due_rules?: DueMatchReminderScheduleRule[]
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

export const getMatchReminderScheduleConfig = async (): Promise<MatchReminderScheduleConfig> => {
  const { data, error } = await supabase.rpc('get_match_reminder_schedule_config')

  if (error) {
    throw error
  }

  return normalizeMatchReminderScheduleConfig(data)
}

export const saveMatchReminderScheduleConfig = async (
  config: MatchReminderScheduleConfig
): Promise<MatchReminderScheduleConfig> => {
  const errors = validateMatchReminderScheduleConfig(config)
  if (errors.length > 0) {
    throw new Error(errors[0])
  }

  const normalizedConfig = normalizeMatchReminderScheduleConfig(config)
  const { data, error } = await supabase.rpc('save_match_reminder_schedule_config', {
    p_config: normalizedConfig
  })

  if (error) {
    throw error
  }

  return normalizeMatchReminderScheduleConfig(data)
}
