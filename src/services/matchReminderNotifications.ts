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

export type MatchReminderHealthStatusLevel = 'healthy' | 'warning' | 'unhealthy'

export type MatchReminderHealthStatus = {
  status: MatchReminderHealthStatusLevel
  messages: string[]
  checked_at: string
  cron: {
    exists: boolean
    active: boolean
    schedule: string | null
    last_status: string | null
    last_return_message: string | null
    last_start_time: string | null
    last_end_time: string | null
  }
  http: {
    last_status_code: number | null
    last_timed_out: boolean
    last_error_message: string | null
    last_created_at: string | null
  }
  config: {
    enabled: boolean
    rule_count: number
  }
  recent_alert_count: number
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

export const getMatchReminderHealthStatus = async (): Promise<MatchReminderHealthStatus> => {
  const { data, error } = await supabase.rpc('get_match_reminder_health_status')

  if (error) {
    throw error
  }

  const status = (data || {}) as Partial<MatchReminderHealthStatus>
  return {
    status: status.status || 'warning',
    messages: Array.isArray(status.messages) ? status.messages : [],
    checked_at: status.checked_at || new Date().toISOString(),
    cron: {
      exists: Boolean(status.cron?.exists),
      active: Boolean(status.cron?.active),
      schedule: status.cron?.schedule || null,
      last_status: status.cron?.last_status || null,
      last_return_message: status.cron?.last_return_message || null,
      last_start_time: status.cron?.last_start_time || null,
      last_end_time: status.cron?.last_end_time || null
    },
    http: {
      last_status_code: status.http?.last_status_code ?? null,
      last_timed_out: Boolean(status.http?.last_timed_out),
      last_error_message: status.http?.last_error_message || null,
      last_created_at: status.http?.last_created_at || null
    },
    config: {
      enabled: Boolean(status.config?.enabled),
      rule_count: Number(status.config?.rule_count || 0)
    },
    recent_alert_count: Number(status.recent_alert_count || 0)
  }
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
