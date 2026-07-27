import { supabase } from '@/services/supabase'
import type {
  SchoolTeamMonthlyFeeProgramKey,
  SchoolTeamMonthlyPerSessionDefaults
} from '@/types/schoolTeamMonthlyFee'
import { isSupabaseRpcMissingError } from '@/utils/supabaseRpc'
import {
  DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE,
  DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
  DEFAULT_SCHOOL_TEAM_SINGLE_MONTHLY_FEE,
  normalizeSchoolTeamMonthlyPerSessionDefaults
} from '@/utils/schoolTeamMonthlyFee'

const GET_RPC = 'get_school_team_monthly_per_session_defaults'
const SAVE_RPC = 'save_school_team_monthly_per_session_defaults'

const normalizeDefaults = (programKey: SchoolTeamMonthlyFeeProgramKey, row: any) =>
  normalizeSchoolTeamMonthlyPerSessionDefaults({
    calculationMode: row?.calculation_mode,
    singleMonthlyFee: row?.single_monthly_fee ?? DEFAULT_SCHOOL_TEAM_SINGLE_MONTHLY_FEE,
    regularPerSessionFee: row?.regular_per_session_fee ?? DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
    discountPerSessionFee: row?.discount_per_session_fee ?? DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE
  }, programKey)

export const getSchoolTeamMonthlyPerSessionDefaults = async (
  programKey: SchoolTeamMonthlyFeeProgramKey
) => {
  const { data, error } = await supabase.rpc(GET_RPC, { p_program_key: programKey })
  if (error) {
    if (isSupabaseRpcMissingError(error, GET_RPC)) {
      console.warn(`${GET_RPC} RPC 尚未部署，${programKey} 暫以內建月費設定計算。`)
      return normalizeSchoolTeamMonthlyPerSessionDefaults(null, programKey)
    }
    throw error
  }

  return normalizeDefaults(programKey, data)
}

export const saveSchoolTeamMonthlyPerSessionDefaults = async (
  programKey: SchoolTeamMonthlyFeeProgramKey,
  defaults: SchoolTeamMonthlyPerSessionDefaults
) => {
  const normalized = normalizeSchoolTeamMonthlyPerSessionDefaults(defaults, programKey)
  const { data, error } = await supabase.rpc(SAVE_RPC, {
    p_program_key: programKey,
    p_calculation_mode: normalized.calculationMode,
    p_single_monthly_fee: normalized.singleMonthlyFee,
    p_regular_per_session_fee: normalized.regularPerSessionFee,
    p_discount_per_session_fee: normalized.discountPerSessionFee
  })
  if (error) throw error

  return normalizeDefaults(programKey, data)
}
