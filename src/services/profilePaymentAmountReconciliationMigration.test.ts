import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const migrationUrl = new URL(
  '../../supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_profile_payment_amount_reconciliation_migration.sql',
  import.meta.url
)

describe('profile payment amount reconciliation migration', () => {
  const source = readFileSync(migrationUrl, 'utf8')

  it('stores server expected and user reported amounts without rewriting approved history', () => {
    expect(source).toContain('add column if not exists expected_amount integer')
    expect(source).toContain('add column if not exists reported_external_amount integer')
    expect(source).toContain("where s.status = 'pending_review'")
    expect(source).not.toContain('_profile_payment_history_audit')
    expect(source).toContain("set_config('jg.profile_payment_history_row_count'")
    expect(source).toContain("current_setting('jg.profile_payment_history_row_count'")
    expect(source).toContain('non-pending profile payment history changed')
  })

  it('blocks underpayment and validates exact overpayment confirmation in the review RPC', () => {
    expect(source).toContain("raise exception 'underpaid payment submission cannot be approved'")
    expect(source).toContain("raise exception 'overpayment confirmation does not match system calculated difference'")
    expect(source).toContain("format('profile_payment:%s:%s:overpayment'")
    expect(source).toContain("format('profile_payment:%s:overpayment'")
    expect(source).toContain('amount = v_expected_amount')
    expect(source).not.toContain('payable_amount = v_submission.amount')
  })

  it('requires rejection reasons and exposes reconciliation fields with the submitting profile', () => {
    expect(source).toContain("raise exception 'rejection_reason is required'")
    expect(source).toContain('profile_id uuid')
    expect(source).toContain('expected_external_amount integer')
    expect(source).toContain('amount_difference integer')
    expect(source).toContain('reconciliation_status text')
  })
})
