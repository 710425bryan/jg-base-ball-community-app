import { supabase } from '@/services/supabase'
import type {
  CreateMyQuarterlyPaymentSubmissionPayload,
  CreateMyPaymentSubmissionPayload,
  MyPaymentMember,
  MyPaymentRecord,
  MyPaymentSubmissionEstimate,
  MyPaymentSubmission,
  MyPaymentSubmissionItem
} from '@/types/payments'
import { isActiveRosterMember } from '@/utils/memberLifecycle'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) {
    return [] as T[]
  }

  return Array.isArray(data) ? data : [data]
}

const normalizeNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeSubmissionItem = (row: any): MyPaymentSubmissionItem => ({
  id: row?.id ?? null,
  submission_id: row?.submission_id ?? null,
  member_id: row?.member_id ?? '',
  member_name: row?.member_name ?? '',
  period_key: row?.period_key ?? '',
  amount: normalizeNumber(row?.amount),
  balance_amount: normalizeNumber(row?.balance_amount),
  external_amount: normalizeNumber(row?.external_amount)
})

const normalizeSubmission = (row: any): MyPaymentSubmission | null => {
  if (!row) return null

  return {
    ...row,
    amount: normalizeNumber(row?.amount),
    balance_amount: normalizeNumber(row?.balance_amount),
    external_amount: normalizeNumber(row?.external_amount),
    account_last_5: row?.account_last_5 ?? null,
    note: row?.note ?? null,
    items: Array.isArray(row?.items)
      ? row.items.map(normalizeSubmissionItem)
      : []
  }
}

const filterActivePaymentMembers = async (members: MyPaymentMember[]) => {
  const memberIds = members
    .map((member) => member.member_id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)

  if (memberIds.length === 0) return members

  const { data, error } = await supabase
    .from('team_members_safe')
    .select('id, status, is_inactive_or_graduated')
    .in('id', memberIds)

  if (error) {
    console.warn('無法確認繳費成員是否關閉/畢業，暫以付款 RPC 回傳名單顯示。', error)
    return members
  }

  const activeMemberIds = new Set(
    (data || [])
      .filter(isActiveRosterMember)
      .map((member) => String(member.id))
  )

  return members.filter((member) => activeMemberIds.has(member.member_id))
}

export const listMyPaymentMembers = async () => {
  const { data, error } = await supabase.rpc('list_my_payment_members')

  if (error) {
    throw error
  }

  return filterActivePaymentMembers(unwrapRows<MyPaymentMember>(data))
}

export const getMyPaymentRecords = async (memberId: string) => {
  const { data, error } = await supabase.rpc('get_my_payment_records', {
    p_member_id: memberId
  })

  if (error) {
    throw error
  }

  return unwrapRows<MyPaymentRecord>(data)
}

export const listMyPaymentSubmissions = async (memberId?: string | null) => {
  const { data, error } = await supabase.rpc('list_my_payment_submissions', {
    p_member_id: memberId || null
  })

  if (error) {
    throw error
  }

  return unwrapRows<any>(data)
    .map(normalizeSubmission)
    .filter((submission): submission is MyPaymentSubmission => Boolean(submission))
}

export const createMyPaymentSubmission = async (payload: CreateMyPaymentSubmissionPayload) => {
  const { data, error } = await supabase.rpc('create_my_payment_submission', {
    p_member_id: payload.member_id,
    p_period_key: payload.period_key,
    p_amount: payload.amount,
    p_payment_method: payload.payment_method,
    p_account_last_5: payload.account_last_5 || null,
    p_remittance_date: payload.remittance_date,
    p_note: payload.note || null,
    p_balance_amount: payload.balance_amount || 0
  })

  if (error) {
    throw error
  }

  return normalizeSubmission(unwrapRows<any>(data)[0] || null)
}

export const createMyQuarterlyPaymentSubmission = async (
  payload: CreateMyQuarterlyPaymentSubmissionPayload
) => {
  const { data, error } = await supabase.rpc('create_my_quarterly_payment_submission', {
    p_items: payload.items,
    p_payment_method: payload.payment_method,
    p_account_last_5: payload.account_last_5 || null,
    p_remittance_date: payload.remittance_date,
    p_note: payload.note || null
  })

  if (error) {
    throw error
  }

  return normalizeSubmission(unwrapRows<any>(data)[0] || null)
}

export const listProfilePaymentSubmissions = async () => {
  const { data, error } = await supabase.rpc('list_profile_payment_submissions')

  if (error) {
    throw error
  }

  return unwrapRows<any>(data)
    .map(normalizeSubmission)
    .filter((submission): submission is MyPaymentSubmission => Boolean(submission))
}

export const getMyPaymentSubmissionEstimate = async (memberId: string, periodKey: string) => {
  const { data, error } = await supabase.rpc('get_my_payment_submission_estimate', {
    p_member_id: memberId,
    p_period_key: periodKey
  })

  if (error) {
    throw error
  }

  return unwrapRows<MyPaymentSubmissionEstimate>(data)[0] || null
}

export const reviewMyPaymentSubmission = async (
  submissionId: string,
  status: 'approved' | 'rejected',
  overpaymentAmount = 0
) => {
  const { data, error } = await supabase.rpc('review_profile_payment_submission', {
    p_submission_id: submissionId,
    p_status: status,
    p_overpayment_amount: overpaymentAmount
  })

  if (error) {
    throw error
  }

  return normalizeSubmission(unwrapRows<any>(data)[0] || null)
}
