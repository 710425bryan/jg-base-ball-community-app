import { supabase } from '@/services/supabase'
import type {
  TrainingDateNotificationDispatchResult,
  TrainingMonthDateSaveResult,
  TrainingMonthDates
} from '@/types/trainingDate'
import {
  getDefaultTrainingMonthDates,
  getTrainingMonthStartDate,
  normalizeTrainingMonth,
  normalizeTrainingMonthDateList
} from '@/utils/trainingMonthDates'

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []

const normalizeMonthDates = (payload: any, month?: string | null): TrainingMonthDates => {
  const monthStart = String(payload?.month_start || getTrainingMonthStartDate(month))
  const normalizedMonth = normalizeTrainingMonth(monthStart)
  const trainingDates = normalizeTrainingMonthDateList(
    normalizeStringArray(payload?.training_dates),
    normalizedMonth
  )

  const isDefault = payload?.is_default !== false

  return {
    month_start: getTrainingMonthStartDate(normalizedMonth),
    month: normalizedMonth,
    training_dates: isDefault ? getDefaultTrainingMonthDates(normalizedMonth) : trainingDates,
    note: payload?.note ? String(payload.note) : null,
    is_default: isDefault,
    updated_at: payload?.updated_at || null
  }
}

const normalizeSaveResult = (payload: any, month?: string | null): TrainingMonthDateSaveResult => {
  const monthStart = String(payload?.month_start || getTrainingMonthStartDate(month))
  const normalizedMonth = normalizeTrainingMonth(monthStart)

  return {
    success: payload?.success !== false,
    changed: Boolean(payload?.changed),
    month_start: getTrainingMonthStartDate(normalizedMonth),
    training_dates: normalizeTrainingMonthDateList(
      normalizeStringArray(payload?.training_dates),
      normalizedMonth
    ),
    added_dates: normalizeTrainingMonthDateList(
      normalizeStringArray(payload?.added_dates),
      normalizedMonth
    ),
    removed_dates: normalizeTrainingMonthDateList(
      normalizeStringArray(payload?.removed_dates),
      normalizedMonth
    ),
    note: payload?.note ? String(payload.note) : null,
    updated_at: payload?.updated_at || null
  }
}

const ensureAuthenticatedSession = async () => {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    throw new Error('登入狀態已過期，請重新登入後再試。')
  }

  return data.session
}

export const trainingDatesApi = {
  async getMonthDates(month?: string | null) {
    const { data, error } = await supabase.rpc('get_training_month_dates', {
      p_month: getTrainingMonthStartDate(month)
    })
    if (error) throw error
    return normalizeMonthDates(data, month)
  },

  async saveMonthDates(input: { month: string; trainingDates: string[]; note?: string | null }) {
    const month = normalizeTrainingMonth(input.month)
    const { data, error } = await supabase.rpc('save_training_month_dates', {
      p_month: getTrainingMonthStartDate(month),
      p_training_dates: normalizeTrainingMonthDateList(input.trainingDates, month),
      p_note: input.note || null
    })
    if (error) throw error
    return normalizeSaveResult(data, month)
  },

  async dispatchNotifications(
    result: TrainingMonthDateSaveResult,
    options: { dryRun?: boolean } = {}
  ) {
    const session = await ensureAuthenticatedSession()
    const { data, error } = await supabase.functions.invoke<TrainingDateNotificationDispatchResult>(
      'send-training-date-notifications',
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: {
          month_start: result.month_start,
          training_dates: result.training_dates,
          added_dates: result.added_dates,
          removed_dates: result.removed_dates,
          change_key: result.updated_at || new Date().toISOString(),
          dry_run: options.dryRun === true
        }
      }
    )

    if (error) throw error
    return data
  }
}
