import { supabase } from '@/services/supabase'
import {
  BASEBALL_ABILITY_FEATURE,
  PHYSICAL_TESTS_FEATURE,
  type BaseballAbilityPayload,
  type BaseballAbilityRecord,
  type PerformanceMemberOption,
  type PhysicalTestPayload,
  type PhysicalTestRecord
} from '@/types/performance'

const normalizeNumber = (value: unknown) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

const normalizeDate = (value: unknown) => String(value || '').slice(0, 10)

const normalizeMemberOption = (row: any): PerformanceMemberOption => ({
  id: String(row.id),
  name: row.name || '未命名球員',
  role: row.role ?? null,
  team_group: row.team_group ?? null,
  status: row.status ?? null,
  jersey_number: row.jersey_number ?? null,
  avatar_url: row.avatar_url ?? null
})

const normalizeBaseballAbilityRecord = (row: any): BaseballAbilityRecord => ({
  id: String(row.id),
  team_member_id: String(row.team_member_id),
  test_date: normalizeDate(row.test_date),
  home_to_first: normalizeNumber(row.home_to_first),
  pitch_speed: normalizeNumber(row.pitch_speed),
  home_to_home: normalizeNumber(row.home_to_home),
  exit_velocity: normalizeNumber(row.exit_velocity),
  catch_count: normalizeNumber(row.catch_count),
  base_run_180s_laps: normalizeNumber(row.base_run_180s_laps),
  relay_throw_count: normalizeNumber(row.relay_throw_count),
  created_at: row.created_at || '',
  updated_at: row.updated_at || '',
  member_name: row.member_name ?? null,
  member_role: row.member_role ?? null,
  member_team_group: row.member_team_group ?? null,
  member_status: row.member_status ?? null,
  member_jersey_number: row.member_jersey_number ?? null,
  member_avatar_url: row.member_avatar_url ?? null
})

const normalizePhysicalTestRecord = (row: any): PhysicalTestRecord => ({
  id: String(row.id),
  team_member_id: String(row.team_member_id),
  test_date: normalizeDate(row.test_date),
  height: normalizeNumber(row.height),
  weight: normalizeNumber(row.weight),
  bmi: normalizeNumber(row.bmi),
  arm_span: normalizeNumber(row.arm_span),
  shuttle_run: normalizeNumber(row.shuttle_run),
  sit_and_reach: normalizeNumber(row.sit_and_reach),
  sit_ups: normalizeNumber(row.sit_ups),
  standing_long_jump: normalizeNumber(row.standing_long_jump),
  vertical_jump: normalizeNumber(row.vertical_jump),
  created_at: row.created_at || '',
  updated_at: row.updated_at || '',
  member_name: row.member_name ?? null,
  member_role: row.member_role ?? null,
  member_team_group: row.member_team_group ?? null,
  member_status: row.member_status ?? null,
  member_jersey_number: row.member_jersey_number ?? null,
  member_avatar_url: row.member_avatar_url ?? null
})

export const fetchPerformanceMemberOptions = async () => {
  const { data, error } = await supabase.rpc('get_performance_member_options')

  if (error) throw error
  return (data || []).map(normalizeMemberOption)
}

export const fetchBaseballAbilityRecords = async (teamMemberId?: string | null) => {
  const { data, error } = await supabase.rpc('get_baseball_ability_records', {
    p_team_member_id: teamMemberId || null
  })

  if (error) throw error
  return (data || []).map(normalizeBaseballAbilityRecord)
}

export const fetchPhysicalTestRecords = async (teamMemberId?: string | null) => {
  const { data, error } = await supabase.rpc('get_physical_test_records', {
    p_team_member_id: teamMemberId || null
  })

  if (error) throw error
  return (data || []).map(normalizePhysicalTestRecord)
}

export const createBaseballAbilityRecord = async (payload: BaseballAbilityPayload) => {
  const { error } = await supabase.from('baseball_ability_records').insert(payload)

  if (error) throw error
}

export const updateBaseballAbilityRecord = async (id: string, payload: BaseballAbilityPayload) => {
  const { error } = await supabase.from('baseball_ability_records').update(payload).eq('id', id)

  if (error) throw error
}

export const deleteBaseballAbilityRecord = async (id: string) => {
  const { error } = await supabase.from('baseball_ability_records').delete().eq('id', id)

  if (error) throw error
}

export const createPhysicalTestRecord = async (payload: PhysicalTestPayload) => {
  const { error } = await supabase.from('physical_test_records').insert(payload)

  if (error) throw error
}

export const updatePhysicalTestRecord = async (id: string, payload: PhysicalTestPayload) => {
  const { error } = await supabase.from('physical_test_records').update(payload).eq('id', id)

  if (error) throw error
}

export const deletePhysicalTestRecord = async (id: string) => {
  const { error } = await supabase.from('physical_test_records').delete().eq('id', id)

  if (error) throw error
}

export const getPerformanceFeatureLabel = (feature: string) => {
  if (feature === BASEBALL_ABILITY_FEATURE) return '棒球能力數據'
  if (feature === PHYSICAL_TESTS_FEATURE) return '體能測驗數據'
  return feature
}
