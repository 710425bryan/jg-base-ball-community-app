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
import {
  DEFAULT_TRAINING_PROGRAM_LABEL,
  DEFAULT_TRAINING_PROGRAM_KEY,
  getTrainingProgramFallbackSettings,
  getTrainingProgramSettingByKey,
  normalizeTrainingProgramKey,
  normalizeTrainingProgramWeekdays
} from '@/utils/trainingPrograms'
import { isSupabaseRpcMissingError } from '@/utils/supabaseRpc'

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : []

type TrainingMonthDateProgramOptions = {
  programKey?: string | null
  programLabel?: string | null
  defaultWeekdays?: number[] | null
}

const getFallbackProgramMeta = (options: TrainingMonthDateProgramOptions = {}) => {
  const settings = getTrainingProgramFallbackSettings()
  const setting = getTrainingProgramSettingByKey(settings, options.programKey)
  return {
    programKey: normalizeTrainingProgramKey(options.programKey || setting.program_key),
    programLabel: options.programLabel || setting.label || DEFAULT_TRAINING_PROGRAM_LABEL,
    defaultWeekdays: normalizeTrainingProgramWeekdays(options.defaultWeekdays || setting.default_weekdays)
  }
}

const normalizeMonthDates = (
  payload: any,
  month?: string | null,
  options: TrainingMonthDateProgramOptions = {}
): TrainingMonthDates => {
  const monthStart = String(payload?.month_start || getTrainingMonthStartDate(month))
  const normalizedMonth = normalizeTrainingMonth(monthStart)
  const fallbackMeta = getFallbackProgramMeta(options)
  const programKey = normalizeTrainingProgramKey(payload?.program_key || fallbackMeta.programKey)
  const programLabel = String(payload?.program_label || fallbackMeta.programLabel)
  const defaultWeekdays = normalizeTrainingProgramWeekdays(payload?.default_weekdays || fallbackMeta.defaultWeekdays)
  const trainingDates = normalizeTrainingMonthDateList(
    normalizeStringArray(payload?.training_dates),
    normalizedMonth
  )

  const isDefault = payload?.is_default !== false

  return {
    month_start: getTrainingMonthStartDate(normalizedMonth),
    month: normalizedMonth,
    program_key: programKey,
    program_label: programLabel,
    training_dates: isDefault ? getDefaultTrainingMonthDates(normalizedMonth, defaultWeekdays) : trainingDates,
    note: payload?.note ? String(payload.note) : null,
    is_default: isDefault,
    updated_at: payload?.updated_at || null
  }
}

const normalizeSaveResult = (
  payload: any,
  month?: string | null,
  options: TrainingMonthDateProgramOptions = {}
): TrainingMonthDateSaveResult => {
  const monthStart = String(payload?.month_start || getTrainingMonthStartDate(month))
  const normalizedMonth = normalizeTrainingMonth(monthStart)
  const fallbackMeta = getFallbackProgramMeta(options)

  return {
    success: payload?.success !== false,
    changed: Boolean(payload?.changed),
    month_start: getTrainingMonthStartDate(normalizedMonth),
    program_key: normalizeTrainingProgramKey(payload?.program_key || fallbackMeta.programKey),
    program_label: String(payload?.program_label || fallbackMeta.programLabel),
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
  async getMonthDates(month?: string | null, options: TrainingMonthDateProgramOptions = {}) {
    const monthStart = getTrainingMonthStartDate(month)
    const programKey = normalizeTrainingProgramKey(options.programKey)
    const rpcArgs = {
      p_month: monthStart,
      p_program_key: programKey
    }

    const { data, error } = await supabase.rpc('get_training_month_dates', rpcArgs)
    if (error) {
      if (isSupabaseRpcMissingError(error, 'get_training_month_dates')) {
        if (programKey === DEFAULT_TRAINING_PROGRAM_KEY) {
          const fallback = await supabase.rpc('get_training_month_dates', { p_month: monthStart })
          if (fallback.error) throw fallback.error
          return normalizeMonthDates(fallback.data, month, { ...options, programKey })
        }

        return normalizeMonthDates({
          month_start: monthStart,
          program_key: programKey,
          program_label: options.programLabel,
          is_default: true,
          training_dates: []
        }, month, { ...options, programKey })
      }

      throw error
    }
    return normalizeMonthDates(data, month, { ...options, programKey })
  },

  async saveMonthDates(input: {
    month: string
    trainingDates: string[]
    note?: string | null
    programKey?: string | null
    programLabel?: string | null
    defaultWeekdays?: number[] | null
  }) {
    const month = normalizeTrainingMonth(input.month)
    const programKey = normalizeTrainingProgramKey(input.programKey)
    const rpcArgs = {
      p_month: getTrainingMonthStartDate(month),
      p_training_dates: normalizeTrainingMonthDateList(input.trainingDates, month),
      p_note: input.note || null,
      p_program_key: programKey
    }
    const { data, error } = await supabase.rpc('save_training_month_dates', rpcArgs)
    if (error) {
      if (isSupabaseRpcMissingError(error, 'save_training_month_dates') && programKey === DEFAULT_TRAINING_PROGRAM_KEY) {
        const fallback = await supabase.rpc('save_training_month_dates', {
          p_month: rpcArgs.p_month,
          p_training_dates: rpcArgs.p_training_dates,
          p_note: rpcArgs.p_note
        })
        if (fallback.error) throw fallback.error
        return normalizeSaveResult(fallback.data, month, input)
      }

      throw error
    }
    return normalizeSaveResult(data, month, input)
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
          program_key: result.program_key,
          program_label: result.program_label,
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
