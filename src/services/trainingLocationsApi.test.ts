import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSessionMock = vi.fn()
const invokeMock = vi.fn()
const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock
    },
    functions: {
      invoke: invokeMock
    },
    rpc: rpcMock
  }
}))

describe('trainingLocationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws a typed auth error before protected RPCs when session is missing', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null })

    const { TrainingLocationAuthError, trainingLocationsApi } = await import('./trainingLocationsApi')

    await expect(trainingLocationsApi.listVenues()).rejects.toBeInstanceOf(TrainingLocationAuthError)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('falls back to the legacy default-program listSessions RPC shape', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null })
    rpcMock
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'list_training_location_admin_sessions missing' }
      })
      .mockResolvedValueOnce({
        data: [{
          session_id: 'session-1',
          title: '週六訓練',
          training_date: '2026-07-04',
          status: 'published',
          venues: [{ title: 'A 場', training_date: '2026-07-04', member_ids: ['member-1'] }]
        }],
        error: null
      })

    const { trainingLocationsApi } = await import('./trainingLocationsApi')

    expect(await trainingLocationsApi.listSessions('2026-07-01', '2026-07-31')).toEqual([
      expect.objectContaining({
        session_id: 'session-1',
        status: 'published',
        venues: [expect.objectContaining({ member_ids: ['member-1'] })]
      })
    ])
    expect(rpcMock).toHaveBeenNthCalledWith(1, 'list_training_location_admin_sessions', {
      p_from: '2026-07-01',
      p_to: '2026-07-31',
      p_program_key: 'chunggang_school_team'
    })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'list_training_location_admin_sessions', {
      p_from: '2026-07-01',
      p_to: '2026-07-31'
    })
  })

  it('keeps mixed-program roster rows returned by the roster RPC', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null })
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          member_id: 'member-1',
          name: '中港球員',
          role: '校隊',
          team_group: '中港校隊',
          training_program: 'chunggang_school_team',
          training_program_label: '中港校隊',
          jersey_number: '10',
          fee_billing_mode: 'role_default',
          is_on_leave: false
        },
        {
          member_id: 'member-2',
          name: '新泰球員',
          role: '校隊',
          team_group: '國中校隊',
          training_program: 'junior_high_school_team',
          training_program_label: '國中校隊',
          jersey_number: '12',
          fee_billing_mode: 'role_default',
          is_on_leave: true
        }
      ],
      error: null
    })

    const { trainingLocationsApi } = await import('./trainingLocationsApi')

    await expect(trainingLocationsApi.listRoster('2026-07-05', 'junior_high_school_team')).resolves.toEqual([
      expect.objectContaining({
        member_id: 'member-1',
        training_program: 'chunggang_school_team',
        training_program_label: '中港總部'
      }),
      expect.objectContaining({
        member_id: 'member-2',
        training_program: 'junior_high_school_team',
        training_program_label: '新泰總部',
        is_on_leave: true
      })
    ])
    expect(rpcMock).toHaveBeenCalledWith('list_training_location_roster', {
      p_training_date: '2026-07-05',
      p_program_key: 'junior_high_school_team'
    })
  })

  it('dispatches location notifications with bearer auth', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token-1' } }, error: null })
    invokeMock.mockResolvedValue({ data: { success: true }, error: null })

    const { trainingLocationsApi } = await import('./trainingLocationsApi')

    await expect(trainingLocationsApi.dispatchNotifications({
      targetDate: '2026-07-05',
      sessionId: 'session-1',
      dryRun: true
    })).resolves.toEqual({ success: true })
    expect(invokeMock).toHaveBeenCalledWith('send-training-location-notifications', {
      headers: { Authorization: 'Bearer token-1' },
      body: {
        target_date: '2026-07-05',
        session_id: 'session-1',
        dry_run: true
      }
    })
  })
})
