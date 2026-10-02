import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), single: vi.fn() }))
vi.mock('@/services/supabase', () => ({ supabase: { rpc: mocks.rpc } }))
import { createAppRole, updateAppRoleWeight } from './rolesApi'

describe('createAppRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockReturnValue({ single: mocks.single })
    mocks.single.mockResolvedValue({ data: { role_key: 'ASSISTANT', role_name: '助理', is_system: false, weight: 100 }, error: null })
  })

  it('creates the role and its selected permission snapshot with one RPC', async () => {
    const role = await createAppRole({ role_key: ' ASSISTANT ', role_name: ' 助理 ', copy_from_role_key: ' COACH ' })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_app_role', {
      p_role_key: 'ASSISTANT', p_role_name: '助理', p_copy_from_role_key: 'COACH'
    })
    expect(mocks.single).toHaveBeenCalledOnce()
    expect(role.role_key).toBe('ASSISTANT')
  })

  it.each([undefined, null, '', '  '])('passes null for an empty copy source %s', async (source) => {
    await createAppRole({ role_key: 'ASSISTANT', role_name: '助理', copy_from_role_key: source })
    expect(mocks.rpc).toHaveBeenCalledWith('create_app_role', expect.objectContaining({ p_copy_from_role_key: null }))
  })

  it('keeps permission, duplicate and copy failures for the form to report', async () => {
    const error = { code: '23505', message: '角色識別碼已存在' }
    mocks.single.mockResolvedValue({ data: null, error })
    await expect(createAppRole({ role_key: 'ASSISTANT', role_name: '助理' })).rejects.toBe(error)
  })

  it('explains a missing migration without falling back to partial table inserts', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    await expect(createAppRole({ role_key: 'ASSISTANT', role_name: '助理' })).rejects.toThrow('請先部署角色權限複製')
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it('rejects an empty server result', async () => {
    mocks.single.mockResolvedValue({ data: null, error: null })
    await expect(createAppRole({ role_key: 'ASSISTANT', role_name: '助理' })).rejects.toThrow('未回傳結果')
  })
})

describe('updateAppRoleWeight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockReturnValue({ single: mocks.single })
    mocks.single.mockResolvedValue({ data: { role_key: 'FINANCE', role_name: '財務', is_system: true, weight: 5 }, error: null })
  })

  it('updates only the role weight through the protected RPC and returns the saved role', async () => {
    expect(await updateAppRoleWeight(' FINANCE ', 5)).toMatchObject({ role_key: 'FINANCE', weight: 5 })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('update_app_role_weight', { p_role_key: 'FINANCE', p_weight: 5 })
  })

  it.each([0, -1, 1.5, NaN, Infinity, 2147483648])('rejects invalid weight %s before sending a request', async (weight) => {
    await expect(updateAppRoleWeight('FINANCE', weight)).rejects.toThrow('請輸入')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('reports a missing migration without falling back to raw table updates', async () => {
    mocks.single.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    await expect(updateAppRoleWeight('FINANCE', 5)).rejects.toThrow('請先部署角色排序')
  })

  it('preserves backend authorization failures', async () => {
    const error = { code: '42501', message: '只有有效管理員可以調整角色排序' }
    mocks.single.mockResolvedValue({ data: null, error })
    await expect(updateAppRoleWeight('FINANCE', 5)).rejects.toBe(error)
  })

  it('rejects an empty result instead of claiming the change succeeded', async () => {
    mocks.single.mockResolvedValue({ data: null, error: null })
    await expect(updateAppRoleWeight('FINANCE', 5)).rejects.toThrow('未回傳結果')
  })
})
