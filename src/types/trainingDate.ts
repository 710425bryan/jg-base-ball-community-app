export type TrainingMonthDateItem = {
  date: string
  weekday: string
  label: string
  is_today: boolean
  is_past: boolean
}

export type TrainingMonthDates = {
  month_start: string
  month: string
  program_key: string
  program_label: string
  training_dates: string[]
  note: string | null
  is_default: boolean
  updated_at: string | null
}

export type TrainingMonthDateSaveResult = {
  success?: boolean
  changed: boolean
  month_start: string
  program_key: string
  program_label: string
  training_dates: string[]
  added_dates: string[]
  removed_dates: string[]
  note: string | null
  updated_at: string | null
}

export type TrainingDateNotificationDispatchResult = {
  success?: boolean
  dry_run?: boolean
  month_start?: string
  program_key?: string
  program_label?: string
  target_row_count?: number
  group_count?: number
  active_user_count?: number
  total_targets?: number
  created_count?: number
  duplicate_count?: number
  dispatched_count?: number
  expired_count?: number
  failed_count?: number
  error?: string
}
