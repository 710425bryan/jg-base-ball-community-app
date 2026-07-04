import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BASEBALL_ABILITY_FEATURE,
  PHYSICAL_TESTS_FEATURE
} from '@/types/performance'

const rpcMock = vi.fn()
const eqMock = vi.fn()
const insertMock = vi.fn()
const updateMock = vi.fn(() => ({ eq: eqMock }))
const deleteMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({
  insert: insertMock,
  update: updateMock,
  delete: deleteMock
}))

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: fromMock,
    rpc: rpcMock
  }
}))

describe('performanceApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and normalizes performance member options and labels', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 1, name: '', jersey_number: 8 }],
      error: null
    })

    const { fetchPerformanceMemberOptions, getPerformanceFeatureLabel } = await import('./performanceApi')

    expect(await fetchPerformanceMemberOptions(BASEBALL_ABILITY_FEATURE)).toEqual([
      expect.objectContaining({
        id: '1',
        name: '未命名球員',
        jersey_number: 8
      })
    ])
    expect(getPerformanceFeatureLabel(BASEBALL_ABILITY_FEATURE)).toBe('棒球能力數據')
    expect(getPerformanceFeatureLabel(PHYSICAL_TESTS_FEATURE)).toBe('體能測驗數據')
    expect(getPerformanceFeatureLabel('custom')).toBe('custom')
  })

  it('normalizes baseball and physical records from RPC data', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [{ id: 1, team_member_id: 2, test_date: '2026-07-05T00:00:00Z', pitch_speed: '88.5' }],
        error: null
      })
      .mockResolvedValueOnce({
        data: [{ id: 3, team_member_id: 4, test_date: '2026-07-06', height: '150.5', bmi: 'bad' }],
        error: null
      })

    const { fetchBaseballAbilityRecords, fetchPhysicalTestRecords } = await import('./performanceApi')

    expect(await fetchBaseballAbilityRecords('member-1')).toEqual([
      expect.objectContaining({
        id: '1',
        team_member_id: '2',
        test_date: '2026-07-05',
        pitch_speed: 88.5,
        home_to_first: 0
      })
    ])
    expect(await fetchPhysicalTestRecords(null)).toEqual([
      expect.objectContaining({
        id: '3',
        team_member_id: '4',
        height: 150.5,
        bmi: 0
      })
    ])
  })

  it('writes performance records through the protected tables', async () => {
    insertMock.mockResolvedValue({ error: null })
    eqMock.mockResolvedValue({ error: null })
    const {
      createBaseballAbilityRecord,
      deleteBaseballAbilityRecord,
      updatePhysicalTestRecord
    } = await import('./performanceApi')

    await createBaseballAbilityRecord({ team_member_id: 'member-1', test_date: '2026-07-05' } as any)
    await updatePhysicalTestRecord('record-1', { team_member_id: 'member-1' } as any)
    await deleteBaseballAbilityRecord('record-2')

    expect(fromMock).toHaveBeenNthCalledWith(1, 'baseball_ability_records')
    expect(insertMock).toHaveBeenCalledWith({ team_member_id: 'member-1', test_date: '2026-07-05' })
    expect(fromMock).toHaveBeenNthCalledWith(2, 'physical_test_records')
    expect(updateMock).toHaveBeenCalledWith({ team_member_id: 'member-1' })
    expect(eqMock).toHaveBeenCalledWith('id', 'record-1')
    expect(fromMock).toHaveBeenNthCalledWith(3, 'baseball_ability_records')
    expect(deleteMock).toHaveBeenCalled()
  })
})
