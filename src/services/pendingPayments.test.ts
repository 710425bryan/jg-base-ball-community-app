import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingPaymentSubmission } from '@/types/pendingPayments'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/services/supabase', () => ({ supabase: { rpc } }))
import { deleteMyPendingPaymentSubmission, listMyPendingPaymentSubmissions, updateMyPendingPaymentSubmission } from './pendingPayments'

describe('pending payment service', () => {
  beforeEach(() => rpc.mockReset())

  it('lists the selected member through the owner-scoped RPC', async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    expect(await listMyPendingPaymentSubmissions('member-1')).toEqual([])
    expect(rpc).toHaveBeenCalledWith('list_my_pending_payment_submissions', { p_member_id: 'member-1' })
  })

  it.each(['membership', 'equipment', 'match'] as const)('passes the original version for %s updates and deletions', async (kind) => {
    rpc.mockResolvedValue({ error: null })
    const submission = { id: 's1', kind, updated_at: '2026-09-07T10:00:00.000001+00:00' } as PendingPaymentSubmission
    const changes = { payment_method: '現金', account_last_5: null, remittance_date: '2026-09-07', note: null, amount_mismatch_reason: null, items: [] }
    await updateMyPendingPaymentSubmission(submission, changes)
    expect(rpc).toHaveBeenLastCalledWith('mutate_my_pending_payment_submission', {
      p_kind: kind, p_submission_id: 's1', p_updated_at: submission.updated_at, p_changes: changes, p_delete: false
    })
    await deleteMyPendingPaymentSubmission(submission)
    expect(rpc).toHaveBeenLastCalledWith('mutate_my_pending_payment_submission', {
      p_kind: kind, p_submission_id: 's1', p_updated_at: submission.updated_at, p_changes: null, p_delete: true
    })
  })

  it('propagates conflicts so the UI reloads stale state', async () => {
    const error = { code: 'P0002', message: 'changed' }
    rpc.mockResolvedValue({ error })
    await expect(deleteMyPendingPaymentSubmission({} as PendingPaymentSubmission)).rejects.toBe(error)
  })
})
