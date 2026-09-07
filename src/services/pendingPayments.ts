import { supabase } from '@/services/supabase'
import type { PendingPaymentChanges, PendingPaymentSubmission } from '@/types/pendingPayments'

export const listMyPendingPaymentSubmissions = async (memberId: string) => {
  const { data, error } = await supabase.rpc('list_my_pending_payment_submissions', {
    p_member_id: memberId
  })
  if (error) throw error
  return (data || []) as PendingPaymentSubmission[]
}

export const updateMyPendingPaymentSubmission = async (
  submission: PendingPaymentSubmission,
  changes: PendingPaymentChanges
) => {
  const { error } = await supabase.rpc('mutate_my_pending_payment_submission', {
    p_kind: submission.kind,
    p_submission_id: submission.id,
    p_updated_at: submission.updated_at,
    p_changes: changes,
    p_delete: false
  })
  if (error) throw error
}

export const deleteMyPendingPaymentSubmission = async (submission: PendingPaymentSubmission) => {
  const { error } = await supabase.rpc('mutate_my_pending_payment_submission', {
    p_kind: submission.kind,
    p_submission_id: submission.id,
    p_updated_at: submission.updated_at,
    p_changes: null,
    p_delete: true
  })
  if (error) throw error
}

export const isPendingPaymentConflict = (error: unknown) =>
  (error as { code?: string })?.code === 'P0002'

export const pendingPaymentErrorMessage = (error: unknown) => {
  const value = error as { code?: string; message?: string }
  if (isPendingPaymentConflict(error)) return '此回報已被審核、修改或刪除，已重新載入最新資料，請重新操作。'
  if (value?.code === 'PGRST202' || value?.code === '42883') {
    return '付款回報修改功能尚未啟用，請聯絡管理員更新系統。'
  }
  return value?.message || '無法處理付款回報，請稍後再試。'
}
