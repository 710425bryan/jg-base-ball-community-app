import { supabase } from '@/services/supabase'
import type {
  CreateMyPaymentSubmissionPayload,
  MyPaymentMember,
  MyPaymentRecord,
  MyPaymentSubmissionEstimate,
  MyPaymentSubmission
} from '@/types/payments'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) {
    return [] as T[]
  }

  return Array.isArray(data) ? data : [data]
}

export const listMyPaymentMembers = async () => {
  const { data, error } = await supabase.rpc('list_my_payment_members')

  if (error) {
    throw error
  }

  return unwrapRows<MyPaymentMember>(data)
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

  return unwrapRows<MyPaymentSubmission>(data)
}

export const createMyPaymentSubmission = async (payload: CreateMyPaymentSubmissionPayload) => {
  const { data, error } = await supabase.rpc('create_my_payment_submission', {
    p_member_id: payload.member_id,
    p_period_key: payload.period_key,
    p_amount: payload.amount,
    p_payment_method: payload.payment_method,
    p_account_last_5: payload.account_last_5 || null,
    p_remittance_date: payload.remittance_date,
    p_note: payload.note || null
  })

  if (error) {
    throw error
  }

  return unwrapRows<MyPaymentSubmission>(data)[0] || null
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
