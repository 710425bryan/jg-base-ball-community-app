export const BASEBALL_ABILITY_FEATURE = 'baseball_ability' as const
export const PHYSICAL_TESTS_FEATURE = 'physical_tests' as const

export type PerformanceRecordKind = typeof BASEBALL_ABILITY_FEATURE | typeof PHYSICAL_TESTS_FEATURE

export type PerformanceMetricDefinition = {
  key: string
  label: string
  unit?: string
  precision?: number
}

export type PerformanceMemberOption = {
  id: string
  name: string
  role: string | null
  team_group: string | null
  status: string | null
  jersey_number: string | null
  avatar_url: string | null
}

export type PerformanceMemberFields = {
  member_name: string | null
  member_role: string | null
  member_team_group: string | null
  member_status: string | null
  member_jersey_number: string | null
  member_avatar_url: string | null
}

export type PerformanceRecordBase = PerformanceMemberFields & {
  id: string
  team_member_id: string
  test_date: string
  created_at: string
  updated_at: string
}

export type BaseballAbilityRecord = PerformanceRecordBase & {
  home_to_first: number
  pitch_speed: number
  home_to_home: number
  exit_velocity: number
  catch_count: number
  base_run_180s_laps: number
  relay_throw_count: number
}

export type BaseballAbilityPayload = {
  team_member_id: string
  test_date: string
  home_to_first: number
  pitch_speed: number
  home_to_home: number
  exit_velocity: number
  catch_count: number
  base_run_180s_laps: number
  relay_throw_count: number
}

export type PhysicalTestRecord = PerformanceRecordBase & {
  height: number
  weight: number
  bmi: number
  arm_span: number
  shuttle_run: number
  sit_and_reach: number
  sit_ups: number
  standing_long_jump: number
  vertical_jump: number
}

export type PhysicalTestPayload = {
  team_member_id: string
  test_date: string
  height: number
  weight: number
  bmi: number
  arm_span: number
  shuttle_run: number
  sit_and_reach: number
  sit_ups: number
  standing_long_jump: number
  vertical_jump: number
}

export type PerformanceRecord = BaseballAbilityRecord | PhysicalTestRecord
export type PerformancePayload = BaseballAbilityPayload | PhysicalTestPayload

export type PerformanceSubmitMeta = {
  recordId?: string | null
  isSameMonthUpdate?: boolean
}
