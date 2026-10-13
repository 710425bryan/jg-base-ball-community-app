import { beforeEach, describe, expect, it, vi } from 'vitest'

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }))

vi.mock('@/services/supabase', () => ({ supabase: { rpc: rpcMock, from: fromMock } }))

import { softDeletePlayer } from './playerRosterMutations'

describe('softDeletePlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcMock.mockResolvedValue({ data: 'member-1', error: null })
  })

  it('uses the permission-checked RPC without deleting rows or saving other form fields', async () => {
    await softDeletePlayer('member-1')
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith('soft_delete_team_member', { p_member_id: 'member-1' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects an empty target before contacting Supabase', async () => {
    await expect(softDeletePlayer(' ')).rejects.toThrow('缺少隊職員資料')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it.each([null, 'member-2'])('does not report success without confirmation of the requested member (%s)', async (data) => {
    rpcMock.mockResolvedValue({ data, error: null })
    await expect(softDeletePlayer('member-1')).rejects.toThrow('無法確認刪除結果')
  })

  it('propagates database failures without a destructive or status-update fallback', async () => {
    const error = { message: 'permission denied', code: '42501' }
    rpcMock.mockResolvedValue({ data: null, error })
    await expect(softDeletePlayer('member-1')).rejects.toBe(error)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it.each(['PGRST202', '42883'])('explains a missing soft-delete RPC (%s) without falling back', async (code) => {
    rpcMock.mockResolvedValue({ data: null, error: { code, message: 'missing function' } })
    await expect(softDeletePlayer('member-1')).rejects.toThrow('軟刪除功能尚未更新')
    expect(fromMock).not.toHaveBeenCalled()
  })
})
