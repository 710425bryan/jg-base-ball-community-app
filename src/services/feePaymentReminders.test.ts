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

describe('feePaymentReminders service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws a typed auth error when session is missing', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null })

    const { FeePaymentReminderAuthError, previewFeePaymentReminders } = await import('./feePaymentReminders')

    await expect(previewFeePaymentReminders({
      categories: ['community'],
      monthly_period: '2026-06',
      quarterly_period: '2026-Q3'
    })).rejects.toBeInstanceOf(FeePaymentReminderAuthError)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('previews fee payment reminders with bearer auth and normalized payload', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token-1' } }, error: null })
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        mode: 'preview',
        member_count: 1,
        target_user_count: 1,
        total_amount: 2000,
        categories: ['unknown', 'community'],
        targets: [{
          user_id: 'user-1',
          member_ids: ['member-1'],
          member_names: ['王小明'],
          total_amount: 2000,
          title: '繳費提醒',
          body: 'body',
          url: '/my-payments',
          items: [{
            fee_id: 'monthly-1',
            billing_type: 'monthly',
            period_key: '2026-06',
            period_label: '2026-06',
            category: 'community',
            member_ids: ['member-1'],
            member_names: ['王小明'],
            amount: '2000'
          }]
        }]
      },
      error: null
    })

    const { previewFeePaymentReminders } = await import('./feePaymentReminders')
    const result = await previewFeePaymentReminders({
      categories: ['community'],
      monthly_period: '2026-06',
      quarterly_period: '2026-q3'
    })

    expect(invokeMock).toHaveBeenCalledWith('send-fee-payment-reminders', {
      headers: { Authorization: 'Bearer token-1' },
      body: {
        mode: 'preview',
        categories: ['community'],
        monthly_period: '2026-06',
        quarterly_period: '2026-Q3'
      }
    })
    expect(result).toMatchObject({
      success: true,
      mode: 'preview',
      member_count: 1,
      target_user_count: 1,
      total_amount: 2000,
      categories: ['community'],
      targets: [
        expect.objectContaining({
          user_id: 'user-1',
          total_amount: 2000,
          items: [expect.objectContaining({ amount: 2000 })]
        })
      ]
    })
  })

  it('sends and tests with the expected mode', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token-1' } }, error: null })
    invokeMock.mockResolvedValue({ data: { success: true }, error: null })

    const { sendFeePaymentReminderTest, sendFeePaymentReminders } = await import('./feePaymentReminders')

    await sendFeePaymentReminders({
      categories: ['chunggang_school_team'],
      monthly_period: '2026-06',
      quarterly_period: '2026-Q3'
    })
    await sendFeePaymentReminderTest({
      categories: ['community'],
      monthly_period: '2026-06',
      quarterly_period: '2026-Q3'
    })

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'send-fee-payment-reminders', expect.objectContaining({
      body: expect.objectContaining({ mode: 'send' })
    }))
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'send-fee-payment-reminders', expect.objectContaining({
      body: expect.objectContaining({ mode: 'test' })
    }))
  })
})
