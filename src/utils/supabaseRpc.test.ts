import { beforeEach, describe, expect, it } from 'vitest'
import {
  isSupabaseRpcMissingError,
  isSupabaseRpcUnavailable,
  markSupabaseRpcUnavailable,
  resetSupabaseRpcAvailabilityCache
} from './supabaseRpc'

describe('supabaseRpc', () => {
  beforeEach(() => {
    resetSupabaseRpcAvailabilityCache()
  })

  it('detects missing RPC errors from Supabase PostgREST responses', () => {
    expect(isSupabaseRpcMissingError({ code: 'PGRST202' })).toBe(true)
    expect(isSupabaseRpcMissingError({
      code: 'PGRST202',
      message: 'Could not find the function public.get_dashboard_today_attendance_status'
    }, 'get_dashboard_today_attendance_status')).toBe(true)
    expect(isSupabaseRpcMissingError({
      code: 'PGRST202',
      details: 'Searched for public.other_rpc'
    }, 'get_dashboard_today_attendance_status')).toBe(false)
    expect(isSupabaseRpcMissingError({ code: '42501' })).toBe(false)
  })

  it('caches unavailable RPC names until reset', () => {
    markSupabaseRpcUnavailable('get_dashboard_today_attendance_status')

    expect(isSupabaseRpcUnavailable('get_dashboard_today_attendance_status')).toBe(true)
    expect(isSupabaseRpcUnavailable('other_rpc')).toBe(false)

    resetSupabaseRpcAvailabilityCache()
    expect(isSupabaseRpcUnavailable('get_dashboard_today_attendance_status')).toBe(false)
  })
})
