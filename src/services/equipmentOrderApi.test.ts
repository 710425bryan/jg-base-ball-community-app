import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), select: vi.fn(), order: vi.fn() }))
vi.mock('@/services/supabase', () => ({ supabase: mocks }))
import { fetchEquipmentOrder, saveEquipmentOrder } from './equipmentOrderApi'

describe('equipmentOrderApi', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.from.mockReturnValue(mocks)
    mocks.select.mockReturnValue(mocks)
  })
  it('reads the shared positions', async () => {
    mocks.order.mockResolvedValue({ data: [{ equipment_id: 'b' }, { equipment_id: 'a' }], error: null })
    expect(await fetchEquipmentOrder()).toEqual(['b', 'a'])
    expect(mocks.from).toHaveBeenCalledWith('equipment_display_order')
    expect(mocks.order).toHaveBeenCalledWith('position', { ascending: true })
  })
  it('only falls back for a missing migration, not permission or network failures', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      mocks.order.mockResolvedValue({ data: null, error: { code } })
      expect(await fetchEquipmentOrder()).toEqual([])
    }
    mocks.order.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(fetchEquipmentOrder()).rejects.toMatchObject({ message: 'offline' })
  })
  it('sends both the complete draft and original order for atomic conflict detection', async () => {
    mocks.rpc.mockResolvedValue({ error: null })
    await saveEquipmentOrder(['b', 'a'], ['a', 'b'])
    expect(mocks.rpc).toHaveBeenCalledWith('reorder_equipment', {
      p_equipment_ids: ['b', 'a'], p_expected_equipment_ids: ['a', 'b']
    })
    mocks.rpc.mockResolvedValue({ error: { message: '排序已更新' } })
    await expect(saveEquipmentOrder(['b', 'a'], ['a', 'b'])).rejects.toMatchObject({ message: '排序已更新' })
  })
})
