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

describe('trainingApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes training members and sessions from RPC rows', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ member_id: 1, name: '小明', point_balance: '10', reserved_points: '3', available_points: '7' }],
        error: null
      })
      .mockResolvedValueOnce({
        data: [{
          session_id: null,
          match_id: 'match-1',
          match_name: '特訓',
          match_date: '2026-07-05',
          capacity: '12',
          selected_members: [{ member_id: 'member-1', name: '小明' }]
        }],
        error: null
      })

    const { trainingApi } = await import('./trainingApi')

    expect(await trainingApi.listMyTrainingMembers()).toEqual([
      expect.objectContaining({
        member_id: '1',
        point_balance: 10,
        reserved_points: 3,
        available_points: 7
      })
    ])
    expect(await trainingApi.listTrainingSessions('member-1')).toEqual([
      expect.objectContaining({
        match_id: 'match-1',
        manual_status: 'draft',
        capacity: 12,
        selected_count: 0,
        selected_members: [expect.objectContaining({ member_id: 'member-1' })]
      })
    ])
  })

  it('normalizes local Taipei datetimes when saving session settings', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null })

    const { trainingApi } = await import('./trainingApi')

    await trainingApi.saveSessionSettings({
      match_id: 'match-1',
      registration_start_at: '2026-07-05 09:00',
      registration_end_at: '2026-07-06T18:00+08:00',
      manual_status: 'open',
      capacity: undefined,
      point_cost: undefined,
      auto_select_enabled: true
    } as any)

    expect(rpcMock).toHaveBeenCalledWith('upsert_training_session_settings', {
      p_match_id: 'match-1',
      p_registration_start_at: '2026-07-05T09:00+08:00',
      p_registration_end_at: '2026-07-06T18:00+08:00',
      p_manual_status: 'open',
      p_capacity: null,
      p_point_cost: 1,
      p_auto_select_enabled: true
    })
  })

  it('dispatches selection notifications with bearer auth', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token-1' } }, error: null })
    invokeMock.mockResolvedValue({ data: { success: true }, error: null })

    const { trainingApi } = await import('./trainingApi')

    await expect(trainingApi.dispatchSelectionNotifications('session-1', {
      dryRun: true,
      forceResend: true
    })).resolves.toEqual({ success: true })
    expect(invokeMock).toHaveBeenCalledWith('send-training-selection-notifications', {
      headers: { Authorization: 'Bearer token-1' },
      body: {
        session_id: 'session-1',
        dry_run: true,
        force_resend: true
      }
    })
  })
})
