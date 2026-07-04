import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const authState = vi.hoisted(() => ({
  user: null as null | { id: string },
  profile: null as null | { linked_team_member_ids?: string[] }
}))

const apiMocks = vi.hoisted(() => ({
  approveEquipmentRequest: vi.fn(),
  cancelEquipmentRequest: vi.fn(),
  createEquipmentPurchaseRequest: vi.fn(),
  deleteEquipmentPurchaseRequestWithRollback: vi.fn(),
  fetchMyEquipmentRequests: vi.fn(),
  fetchReviewEquipmentRequests: vi.fn(),
  listMyEquipmentManualPurchaseRecords: vi.fn(),
  markEquipmentRequestPickedUp: vi.fn(),
  markEquipmentRequestReady: vi.fn(),
  rejectEquipmentRequest: vi.fn()
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authState
}))

vi.mock('@/services/equipmentApi', () => apiMocks)

describe('equipment requests store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { id: 'user-1' }
    authState.profile = { linked_team_member_ids: ['member-1'] }
    setActivePinia(createPinia())
  })

  it('loads my requests with auth user and linked members', async () => {
    apiMocks.fetchMyEquipmentRequests.mockResolvedValue([{ id: 'request-1' }])

    const { useEquipmentRequestsStore } = await import('./equipmentRequests')
    const store = useEquipmentRequestsStore()

    await expect(store.loadMyRequests()).resolves.toEqual([{ id: 'request-1' }])
    expect(apiMocks.fetchMyEquipmentRequests).toHaveBeenCalledWith('user-1', ['member-1'])
    expect(store.isLoading).toBe(false)
  })

  it('returns empty requests when no auth user exists', async () => {
    authState.user = null

    const { useEquipmentRequestsStore } = await import('./equipmentRequests')
    const store = useEquipmentRequestsStore()

    await expect(store.loadMyRequests()).resolves.toEqual([])
    expect(apiMocks.fetchMyEquipmentRequests).not.toHaveBeenCalled()
  })

  it('upserts created and reviewed requests into local lists sorted by update time', async () => {
    apiMocks.fetchReviewEquipmentRequests.mockResolvedValue([
      { id: 'request-1', updated_at: '2026-07-01T00:00:00.000Z' }
    ])
    apiMocks.createEquipmentPurchaseRequest.mockResolvedValue({
      id: 'request-2',
      updated_at: '2026-07-02T00:00:00.000Z'
    })
    apiMocks.approveEquipmentRequest.mockResolvedValue({
      id: 'request-1',
      status: 'approved',
      updated_at: '2026-07-03T00:00:00.000Z'
    })

    const { useEquipmentRequestsStore } = await import('./equipmentRequests')
    const store = useEquipmentRequestsStore()

    await store.loadReviewRequests()
    await store.createRequest({ items: [] } as any)
    await store.approveRequest('request-1')

    expect(apiMocks.createEquipmentPurchaseRequest).toHaveBeenCalledWith({ items: [] }, 'user-1')
    expect(store.reviewRequests.map((request) => request.id)).toEqual(['request-1', 'request-2'])
    expect(store.reviewRequests[0]?.status).toBe('approved')
  })
})
