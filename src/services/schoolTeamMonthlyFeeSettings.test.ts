import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: rpcMock
  }
}))

describe('schoolTeamMonthlyFeeSettings service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads normalized per-session fees', async () => {
    rpcMock.mockResolvedValue({
      data: {
        calculation_mode: 'training_dates',
        single_monthly_fee: 2000,
        regular_per_session_fee: '600',
        discount_per_session_fee: 300
      },
      error: null
    })

    const { getSchoolTeamMonthlyPerSessionDefaults } = await import('./schoolTeamMonthlyFeeSettings')

    await expect(getSchoolTeamMonthlyPerSessionDefaults('chunggang_school_team')).resolves.toEqual({
      calculationMode: 'training_dates',
      singleMonthlyFee: 2000,
      regularPerSessionFee: 600,
      discountPerSessionFee: 300
    })
    expect(rpcMock).toHaveBeenCalledWith('get_school_team_monthly_per_session_defaults', {
      p_program_key: 'chunggang_school_team'
    })
  })

  it('falls back to a 2000 single monthly fee for junior high while the RPC is not deployed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'get_school_team_monthly_per_session_defaults missing' }
    })

    const { getSchoolTeamMonthlyPerSessionDefaults } = await import('./schoolTeamMonthlyFeeSettings')

    await expect(getSchoolTeamMonthlyPerSessionDefaults('junior_high_school_team')).resolves.toEqual({
      calculationMode: 'single_monthly',
      singleMonthlyFee: 2000,
      regularPerSessionFee: 500,
      discountPerSessionFee: 250
    })
  })

  it('saves normalized per-session fees through the protected RPC', async () => {
    rpcMock.mockResolvedValue({
      data: {
        calculation_mode: 'training_dates',
        single_monthly_fee: 2200,
        regular_per_session_fee: 550,
        discount_per_session_fee: 275
      },
      error: null
    })

    const { saveSchoolTeamMonthlyPerSessionDefaults } = await import('./schoolTeamMonthlyFeeSettings')

    await expect(saveSchoolTeamMonthlyPerSessionDefaults('junior_high_school_team', {
      calculationMode: 'training_dates',
      singleMonthlyFee: 2200.9,
      regularPerSessionFee: 550.9,
      discountPerSessionFee: 275.9
    })).resolves.toEqual({
      calculationMode: 'training_dates',
      singleMonthlyFee: 2200,
      regularPerSessionFee: 550,
      discountPerSessionFee: 275
    })
    expect(rpcMock).toHaveBeenCalledWith('save_school_team_monthly_per_session_defaults', {
      p_program_key: 'junior_high_school_team',
      p_calculation_mode: 'training_dates',
      p_single_monthly_fee: 2200,
      p_regular_per_session_fee: 550,
      p_discount_per_session_fee: 275
    })
  })
})
