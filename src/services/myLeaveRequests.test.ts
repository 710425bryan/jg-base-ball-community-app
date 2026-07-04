import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.fn()
const inMock = vi.fn()
const selectMock = vi.fn(() => ({ in: inMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock
  }
}))

describe('myLeaveRequests service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters closed or graduated leave members using safe roster metadata', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { member_id: 'member-1', name: '小明', role: '', team_group: null },
        { member_id: 'member-2', name: '小華', role: '', team_group: null }
      ],
      error: null
    })
    inMock.mockResolvedValue({
      data: [
        { id: 'member-1', status: '在隊', is_inactive_or_graduated: false, role: '校隊', team_group: '中港校隊' },
        { id: 'member-2', status: '離隊', is_inactive_or_graduated: true, role: '球員', team_group: '拉拉熊(小組)' }
      ],
      error: null
    })

    const { listMyLeaveMembers } = await import('./myLeaveRequests')

    await expect(listMyLeaveMembers()).resolves.toEqual([
      expect.objectContaining({
        member_id: 'member-1',
        role: '校隊',
        team_group: '中港校隊'
      })
    ])
    expect(fromMock).toHaveBeenCalledWith('team_members_safe')
    expect(inMock).toHaveBeenCalledWith('id', ['member-1', 'member-2'])
  })

  it('wraps scalar RPC rows and sends create/delete payloads', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { id: 'leave-1' }, error: null })
      .mockResolvedValueOnce({ data: [{ id: 'leave-2' }], error: null })
      .mockResolvedValueOnce({ data: null, error: null })

    const {
      createMyLeaveRequests,
      deleteMyLeaveRequest,
      listMyLeaveRequests
    } = await import('./myLeaveRequests')

    expect(await listMyLeaveRequests('member-1')).toEqual([{ id: 'leave-1' }])
    expect(await createMyLeaveRequests({
      member_id: 'member-1',
      records: [{ leave_type: '事假', start_date: '2026-07-05', end_date: '2026-07-05' }]
    })).toEqual([{ id: 'leave-2' }])
    await deleteMyLeaveRequest('leave-2')

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'list_my_leave_requests', { p_member_id: 'member-1' })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'create_my_leave_requests', {
      p_member_id: 'member-1',
      p_records: [{ leave_type: '事假', start_date: '2026-07-05', end_date: '2026-07-05' }]
    })
    expect(rpcMock).toHaveBeenNthCalledWith(3, 'delete_my_leave_request', {
      p_leave_request_id: 'leave-2'
    })
  })
})
