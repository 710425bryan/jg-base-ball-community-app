import { supabase } from '@/services/supabase'
import type {
  SchoolTeamMonthlyFeeProgramKey,
  SchoolTeamMonthlyPerSessionDefaults
} from '@/types/schoolTeamMonthlyFee'
import { isSupabaseRpcMissingError } from '@/utils/supabaseRpc'
import {
  DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE,
  DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
  normalizeSchoolTeamMonthlyPerSessionDefaults
} from '@/utils/schoolTeamMonthlyFee'

const GET_RPC = 'get_school_team_monthly_per_session_defaults'
const SAVE_RPC = 'save_school_team_monthly_per_session_defaults'

const normalizeDefaults = (row: any) => normalizeSchoolTeamMonthlyPerSessionDefaults({
  regularPerSessionFee: row?.regular_per_session_fee ?? DEFAULT_SCHOOL_TEAM_MONTHLY_REGULAR_PER_SESSION_FEE,
  discountPerSessionFee: row?.discount_per_session_fee ?? DEFAULT_SCHOOL_TEAM_MONTHLY_DISCOUNT_PER_SESSION_FEE
})

export const getSchoolTeamMonthlyPerSessionDefaults = async (
  programKey: SchoolTeamMonthlyFeeProgramKey
) => {
  const { data, error } = await supabase.rpc(GET_RPC, { p_program_key: programKey })
  if (error) {
    if (isSupabaseRpcMissingError(error, GET_RPC)) {
      console.warn(`${GET_RPC} RPC 尚未部署，${programKey} 暫以單次 500 / 250 元計費。`)
      return normalizeSchoolTeamMonthlyPerSessionDefaults()
    }
    throw error
  }

  return normalizeDefaults(data)
}

export const saveSchoolTeamMonthlyPerSessionDefaults = async (
  programKey: SchoolTeamMonthlyFeeProgramKey,
  defaults: SchoolTeamMonthlyPerSessionDefaults
) => {
  const normalized = normalizeSchoolTeamMonthlyPerSessionDefaults(defaults)
  const { data, error } = await supabase.rpc(SAVE_RPC, {
    p_program_key: programKey,
    p_regular_per_session_fee: normalized.regularPerSessionFee,
    p_discount_per_session_fee: normalized.discountPerSessionFee
  })
  if (error) throw error

  return normalizeDefaults(data)
}
