import { supabase } from '@/services/supabase'
import type {
  CreateMyLeaveRequestsPayload,
  MyLeaveMember,
  MyLeaveRequest
} from '@/types/leaveRequests'
import { isActiveRosterMember } from '@/utils/memberLifecycle'

const unwrapRows = <T>(data: T[] | T | null | undefined) => {
  if (!data) {
    return [] as T[]
  }

  return Array.isArray(data) ? data : [data]
}

const filterActiveLeaveMembers = async (members: MyLeaveMember[]) => {
  const memberIds = members
    .map((member) => member.member_id)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)

  if (memberIds.length === 0) return members

  const { data, error } = await supabase
    .from('team_members_safe')
    .select('id, status, is_inactive_or_graduated, role, team_group, training_program')
    .in('id', memberIds)

  if (error) {
    console.warn('無法確認請假成員是否關閉/畢業，暫以假單 RPC 回傳名單顯示。', error)
    return members
  }

  const activeMemberIds = new Set(
    (data || [])
      .filter(isActiveRosterMember)
      .map((member) => String(member.id))
  )

  const metaByMemberId = new Map((data || []).map((member: any) => [
    String(member.id),
    {
      role: member.role ? String(member.role) : null,
      team_group: member.team_group ? String(member.team_group) : null,
      training_program: member.training_program ? String(member.training_program) : null
    }
  ]))

  return members
    .filter((member) => activeMemberIds.has(member.member_id))
    .map((member) => {
      const meta = metaByMemberId.get(member.member_id)
      return {
        ...member,
        role: member.role || meta?.role || '',
        team_group: member.team_group || meta?.team_group || null,
        training_program: member.training_program || meta?.training_program || null
      }
    })
}

export const listMyLeaveMembers = async () => {
  const { data, error } = await supabase.rpc('list_my_leave_members')

  if (error) {
    throw error
  }

  return filterActiveLeaveMembers(unwrapRows<MyLeaveMember>(data))
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
