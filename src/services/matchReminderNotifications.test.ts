import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.fn()
const rpcMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    functions: {
      invoke: invokeMock
    },
    rpc: rpcMock
  }
}))

describe('matchReminderNotifications service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends a manual match reminder with a trimmed match id', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null })

    const { sendMatchReminderNotification } = await import('./matchReminderNotifications')

    await expect(sendMatchReminderNotification(' match-1 ')).resolves.toEqual({ success: true })
    expect(invokeMock).toHaveBeenCalledWith('send-match-reminders', {
      body: {
        match_id: 'match-1',
        source: 'manual'
      }
    })
  })

  it('rejects blank match ids before calling the Edge Function', async () => {
    const { sendMatchReminderNotification } = await import('./matchReminderNotifications')

    await expect(sendMatchReminderNotification('   ')).rejects.toThrow('缺少比賽 ID')
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('normalizes reminder health status defaults', async () => {
    rpcMock.mockResolvedValue({
      data: {
        status: 'healthy',
        messages: 'bad',
        cron: { exists: 1, active: 0 },
        http: { last_status_code: 200, last_timed_out: 0 },
        config: { enabled: 1, rule_count: '2' },
        recent_alert_count: '3'
      },
      error: null
    })

    const { getMatchReminderHealthStatus } = await import('./matchReminderNotifications')

    expect(await getMatchReminderHealthStatus()).toMatchObject({
      status: 'healthy',
      messages: [],
      cron: { exists: true, active: false },
      http: { last_status_code: 200, last_timed_out: false },
      config: { enabled: true, rule_count: 2 },
      recent_alert_count: 3
    })
  })
})
