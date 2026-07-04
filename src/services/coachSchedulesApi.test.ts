import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSessionMock = vi.fn()
const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock
    },
    rpc: rpcMock
  }
}))

describe('coachSchedulesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires an authenticated session before calling schedule RPCs', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null })

    const { coachSchedulesApi } = await import('./coachSchedulesApi')

    await expect(coachSchedulesApi.listAdminMonth('2026-07')).rejects.toThrow('登入狀態已過期')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('loads dashboard month payloads with normalized month arguments', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null })
    rpcMock.mockResolvedValue({
      data: {
        month_start: '2026-07-01',
        scope: 'own',
        events: [{ id: 'event-1', title: '訓練', schedule_date: '2026-07-05', source_type: 'manual' }]
      },
      error: null
    })

    const { listCoachScheduleDashboardMonth } = await import('./coachSchedulesApi')

    expect(await listCoachScheduleDashboardMonth('2026-07')).toMatchObject({
      month_start: '2026-07-01',
      scope: 'own',
      events: [expect.objectContaining({ id: 'event-1', title: '訓練' })]
    })
    expect(rpcMock).toHaveBeenCalledWith('list_coach_schedule_dashboard', {
      p_month: '2026-07-01'
    })
  })

  it('saves events through the expected RPC payload', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token' } }, error: null })
    rpcMock.mockResolvedValue({ data: 'event-1', error: null })

    const { coachSchedulesApi } = await import('./coachSchedulesApi')

    await expect(coachSchedulesApi.saveEvent({
      source_type: 'manual',
      schedule_date: '2026-07-05',
      title: '臨時排班',
      coach_profile_ids: ['coach-1']
    })).resolves.toBe('event-1')
    expect(rpcMock).toHaveBeenCalledWith('save_coach_schedule_event', {
      p_event: expect.objectContaining({
        source_type: 'manual',
        schedule_date: '2026-07-05',
        title: '臨時排班',
        status: 'scheduled'
      }),
      p_coach_profile_ids: ['coach-1']
    })
  })
})
