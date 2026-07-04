import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { BASEBALL_ABILITY_FEATURE } from '@/types/performance'

const apiMocks = vi.hoisted(() => ({
  createBaseballAbilityRecord: vi.fn(),
  createPhysicalTestRecord: vi.fn(),
  deleteBaseballAbilityRecord: vi.fn(),
  deletePhysicalTestRecord: vi.fn(),
  fetchBaseballAbilityRecords: vi.fn(),
  fetchPerformanceMemberOptions: vi.fn(),
  fetchPhysicalTestRecords: vi.fn(),
  updateBaseballAbilityRecord: vi.fn(),
  updatePhysicalTestRecord: vi.fn()
}))

vi.mock('@/services/performanceApi', () => apiMocks)

describe('performance store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('loads members and performance records', async () => {
    apiMocks.fetchPerformanceMemberOptions.mockResolvedValue([{ id: 'member-1', name: '小明' }])
    apiMocks.fetchBaseballAbilityRecords.mockResolvedValue([{ id: 'record-1' }])
    apiMocks.fetchPhysicalTestRecords.mockResolvedValue([{ id: 'record-2' }])

    const { usePerformanceStore } = await import('./performance')
    const store = usePerformanceStore()

    await store.loadMembers(BASEBALL_ABILITY_FEATURE)
    await store.loadBaseballAbilityRecords('member-1')
    await store.loadPhysicalTestRecords('member-1')

    expect(store.members).toEqual([{ id: 'member-1', name: '小明' }])
    expect(store.baseballAbilityRecords).toEqual([{ id: 'record-1' }])
    expect(store.physicalTestRecords).toEqual([{ id: 'record-2' }])
  })

  it('saves baseball records then reloads the requested member', async () => {
    apiMocks.createBaseballAbilityRecord.mockResolvedValue(undefined)
    apiMocks.updateBaseballAbilityRecord.mockResolvedValue(undefined)
    apiMocks.fetchBaseballAbilityRecords.mockResolvedValue([])

    const { usePerformanceStore } = await import('./performance')
    const store = usePerformanceStore()

    await store.saveBaseballAbilityRecord({ team_member_id: 'member-1' } as any, { reloadMemberId: 'member-1' })
    await store.saveBaseballAbilityRecord({ team_member_id: 'member-1' } as any, {
      id: 'record-1',
      reloadMemberId: 'member-1'
    })

    expect(apiMocks.createBaseballAbilityRecord).toHaveBeenCalledTimes(1)
    expect(apiMocks.updateBaseballAbilityRecord).toHaveBeenCalledWith('record-1', { team_member_id: 'member-1' })
    expect(apiMocks.fetchBaseballAbilityRecords).toHaveBeenCalledWith('member-1')
    expect(store.isSaving).toBe(false)
  })

  it('removes physical test records then reloads', async () => {
    apiMocks.deletePhysicalTestRecord.mockResolvedValue(undefined)
    apiMocks.fetchPhysicalTestRecords.mockResolvedValue([])

    const { usePerformanceStore } = await import('./performance')
    const store = usePerformanceStore()

    await store.removePhysicalTestRecord('record-1', 'member-1')

    expect(apiMocks.deletePhysicalTestRecord).toHaveBeenCalledWith('record-1')
    expect(apiMocks.fetchPhysicalTestRecords).toHaveBeenCalledWith('member-1')
  })
})
