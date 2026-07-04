import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetSupabaseRpcAvailabilityCache } from '@/utils/supabaseRpc'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('trainingProgramsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSupabaseRpcAvailabilityCache()
  })

  it('lists normalized settings from the RPC', async () => {
    rpcMock.mockResolvedValue({
      data: [{ program_key: 'Junior High', label: '國中校隊', default_weekdays: [0, 'bad', 0], sort_order: '20' }],
      error: null
    })

    const { trainingProgramsApi } = await import('./trainingProgramsApi')

    expect(await trainingProgramsApi.listSettings()).toEqual([
      expect.objectContaining({
        program_key: 'junior_high',
        label: '國中校隊',
        default_weekdays: [0],
        sort_order: 20
      })
    ])
  })

  it('falls back to default settings and caches when the list RPC is missing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'list_training_program_settings missing' }
    })

    const { trainingProgramsApi } = await import('./trainingProgramsApi')

    expect(await trainingProgramsApi.listSettings()).toHaveLength(2)
    expect(await trainingProgramsApi.listSettings()).toHaveLength(2)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('saves normalized setting payloads', async () => {
    rpcMock.mockResolvedValue({
      data: { program_key: 'junior_high', label: '國中校隊', default_weekdays: [0] },
      error: null
    })

    const { trainingProgramsApi } = await import('./trainingProgramsApi')

    await trainingProgramsApi.saveSetting({
      program_key: 'Junior High',
      label: '國中校隊',
      team_group: '',
      default_weekdays: [0, 8],
      sort_order: null,
      is_active: null
    })

    expect(rpcMock).toHaveBeenCalledWith('save_training_program_setting', {
      p_program_key: 'Junior High',
      p_label: '國中校隊',
      p_team_group: null,
      p_default_weekdays: [0],
      p_default_start_time: null,
      p_default_end_time: null,
      p_default_venue_name: null,
      p_default_venue_address: null,
      p_default_venue_maps_url: null,
      p_sort_order: 0,
      p_is_active: true
    })
  })
})
