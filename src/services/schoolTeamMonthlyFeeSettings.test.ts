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
      data: { regular_per_session_fee: '600', discount_per_session_fee: 300 },
      error: null
    })

    const { getSchoolTeamMonthlyPerSessionDefaults } = await import('./schoolTeamMonthlyFeeSettings')

    await expect(getSchoolTeamMonthlyPerSessionDefaults('chunggang_school_team')).resolves.toEqual({
      regularPerSessionFee: 600,
      discountPerSessionFee: 300
    })
    expect(rpcMock).toHaveBeenCalledWith('get_school_team_monthly_per_session_defaults', {
      p_program_key: 'chunggang_school_team'
    })
  })

  it('falls back to 500 and 250 while the read RPC is not deployed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'get_school_team_monthly_per_session_defaults missing' }
    })

    const { getSchoolTeamMonthlyPerSessionDefaults } = await import('./schoolTeamMonthlyFeeSettings')

    await expect(getSchoolTeamMonthlyPerSessionDefaults('junior_high_school_team')).resolves.toEqual({
      regularPerSessionFee: 500,
      discountPerSessionFee: 250
    })
  })

  it('saves normalized per-session fees through the protected RPC', async () => {
    rpcMock.mockResolvedValue({
      data: { regular_per_session_fee: 550, discount_per_session_fee: 275 },
      error: null
    })

    const { saveSchoolTeamMonthlyPerSessionDefaults } = await import('./schoolTeamMonthlyFeeSettings')

    await expect(saveSchoolTeamMonthlyPerSessionDefaults('junior_high_school_team', {
      regularPerSessionFee: 550.9,
      discountPerSessionFee: 275.9
    })).resolves.toEqual({
      regularPerSessionFee: 550,
      discountPerSessionFee: 275
    })
    expect(rpcMock).toHaveBeenCalledWith('save_school_team_monthly_per_session_defaults', {
      p_program_key: 'junior_high_school_team',
      p_regular_per_session_fee: 550,
      p_discount_per_session_fee: 275
    })
  })
})
