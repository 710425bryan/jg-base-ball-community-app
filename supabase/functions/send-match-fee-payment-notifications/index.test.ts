import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

describe('send-match-fee-payment-notifications Edge Function', () => {
  it('authenticates the caller and requires fees edit permission', () => {
    expect(source).toContain('supabase.auth.getUser(token)')
    expect(source).toContain('.eq("feature", "fees")')
    expect(source).toContain('.eq("action", "EDIT")')
  })

  it('only targets unpaid items after payment has opened', () => {
    expect(source).toContain('match_fee_payment_opened_at')
    expect(source).toContain('if (!data.match_fee_payment_opened_at)')
    expect(source).toContain('.eq("payment_status", "unpaid")')
  })

  it('writes targeted notification-center events before Web Push delivery', () => {
    expect(source).toContain('action: MATCH_FEE_PAYMENT_NOTIFICATION_ACTION')
    expect(source).toContain('target_user_id: input.targetUserId')
    expect(source).toContain('target_member_ids: input.targetMemberIds')
    expect(source).toContain('sendPushToSubscriptions(')
  })
})
