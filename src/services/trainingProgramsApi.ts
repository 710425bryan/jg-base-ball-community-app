import { supabase } from '@/services/supabase'
import type {
  TrainingProgramSetting,
  TrainingProgramSettingSaveInput
} from '@/types/trainingProgram'
import {
  ensureTrainingProgramSettings,
  normalizeTrainingProgramSetting,
  normalizeTrainingProgramWeekdays
} from '@/utils/trainingPrograms'
import {
  isSupabaseRpcMissingError,
  isSupabaseRpcUnavailable,
  markSupabaseRpcUnavailable
} from '@/utils/supabaseRpc'

const LIST_RPC = 'list_training_program_settings'
const SAVE_RPC = 'save_training_program_setting'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) return [] as T[]
  return Array.isArray(data) ? data : [data]
}

const normalizeSaveInput = (input: TrainingProgramSettingSaveInput) => ({
  p_program_key: input.program_key,
  p_label: input.label,
  p_team_group: input.team_group || null,
  p_default_weekdays: normalizeTrainingProgramWeekdays(input.default_weekdays),
  p_default_start_time: input.default_start_time || null,
  p_default_end_time: input.default_end_time || null,
  p_default_venue_name: input.default_venue_name || null,
  p_default_venue_address: input.default_venue_address || null,
  p_default_venue_maps_url: input.default_venue_maps_url || null,
  p_sort_order: input.sort_order ?? 0,
  p_is_active: input.is_active !== false
})

export const trainingProgramsApi = {
  async listSettings(): Promise<TrainingProgramSetting[]> {
    if (isSupabaseRpcUnavailable(LIST_RPC)) {
      return ensureTrainingProgramSettings([])
    }

    const { data, error } = await supabase.rpc(LIST_RPC)
    if (error) {
      if (isSupabaseRpcMissingError(error, LIST_RPC)) {
        markSupabaseRpcUnavailable(LIST_RPC)
        console.warn(`${LIST_RPC} RPC 尚未部署，暫以訓練項目預設值顯示。`)
        return ensureTrainingProgramSettings([])
      }
      throw error
    }

    return ensureTrainingProgramSettings(unwrapRows<any>(data).map(normalizeTrainingProgramSetting))
  },

  async saveSetting(input: TrainingProgramSettingSaveInput) {
    const { data, error } = await supabase.rpc(SAVE_RPC, normalizeSaveInput(input))
    if (error) throw error
    return normalizeTrainingProgramSetting(data)
  }
}
