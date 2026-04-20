import { supabase } from '@/services/supabase'
import type {
  CreateMyLeaveRequestsPayload,
  MyLeaveMember,
  MyLeaveRequest
} from '@/types/leaveRequests'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) {
    return [] as T[]
  }

  return Array.isArray(data) ? data : [data]
}

export const listMyLeaveMembers = async () => {
  const { data, error } = await supabase.rpc('list_my_leave_members')

  if (error) {
    throw error
  }

  return unwrapRows<MyLeaveMember>(data)
}

export const listMyLeaveRequests = async (memberId: string) => {
  const { data, error } = await supabase.rpc('list_my_leave_requests', {
    p_member_id: memberId
  })

  if (error) {
    throw error
  }

  return unwrapRows<MyLeaveRequest>(data)
}

export const createMyLeaveRequests = async (payload: CreateMyLeaveRequestsPayload) => {
  const { data, error } = await supabase.rpc('create_my_leave_requests', {
    p_member_id: payload.member_id,
    p_records: payload.records
  })

  if (error) {
    throw error
  }

  return unwrapRows<MyLeaveRequest>(data)
}

export const deleteMyLeaveRequest = async (leaveRequestId: string) => {
  const { error } = await supabase.rpc('delete_my_leave_request', {
    p_leave_request_id: leaveRequestId
  })

  if (error) {
    throw error
  }
}
