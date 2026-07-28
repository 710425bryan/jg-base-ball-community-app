import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSessionMock = vi.fn()
const invokeMock = vi.fn()

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock
    },
    functions: {
      invoke: invokeMock
    }
  }
}))

describe('matchFeePaymentNotifications service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires an authenticated session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null })

    const {
      MatchFeePaymentNotificationAuthError,
      sendMatchFeePaymentOpenedNotifications
    } = await import('./matchFeePaymentNotifications')

    await expect(sendMatchFeePaymentOpenedNotifications('match-1'))
      .rejects.toBeInstanceOf(MatchFeePaymentNotificationAuthError)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('invokes the targeted notification function and normalizes the result', async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-1' } },
      error: null
    })
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        match_id: 'match-1',
        target_user_count: '2',
        subscription_count: '1',
        created_count: '2',
        dispatched_count: '1',
        targets: [{
          user_id: 'user-1',
          item_ids: ['item-1'],
          member_ids: ['member-1'],
          member_names: ['王小明'],
          total_amount: '100',
          title: '比賽費用已開放付款',
          body: 'body',
          url: '/my-payments',
          event_key: 'event-1'
        }]
      },
      error: null
    })

    const { sendMatchFeePaymentOpenedNotifications } = await import('./matchFeePaymentNotifications')
    const result = await sendMatchFeePaymentOpenedNotifications(' match-1 ')

    expect(invokeMock).toHaveBeenCalledWith('send-match-fee-payment-notifications', {
      headers: { Authorization: 'Bearer token-1' },
      body: { match_id: 'match-1' }
    })
    expect(result).toMatchObject({
      success: true,
      match_id: 'match-1',
      target_user_count: 2,
      subscription_count: 1,
      created_count: 2,
      dispatched_count: 1,
      targets: [expect.objectContaining({ total_amount: 100 })]
    })
  })
})
