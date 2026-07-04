import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const apiMocks = vi.hoisted(() => ({
  VENDOR_PAGE_SIZE: 24,
  createVendor: vi.fn(),
  deleteVendor: vi.fn(),
  fetchVendorTradeCategories: vi.fn(),
  fetchVendors: vi.fn(),
  updateVendor: vi.fn()
}))

vi.mock('@/services/vendorsApi', () => apiMocks)

describe('vendors store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
  })

  it('loads the first vendor page and categories', async () => {
    apiMocks.fetchVendors.mockResolvedValue({
      vendors: [{ id: 'vendor-1', name: '便當店' }],
      total: 2,
      page: 0,
      pageSize: 1,
      hasMore: true
    })
    apiMocks.fetchVendorTradeCategories.mockResolvedValue([{ id: 'cat-1', name: '餐飲' }])

    const { useVendorsStore } = await import('./vendors')
    const store = useVendorsStore()

    await store.loadVendors({
      reset: true,
      pageSize: 1,
      filters: { keyword: '便當', category: '餐飲' }
    })

    expect(apiMocks.fetchVendors).toHaveBeenCalledWith({
      page: 0,
      pageSize: 1,
      filters: { keyword: '便當', category: '餐飲' }
    })
    expect(store.vendors).toEqual([{ id: 'vendor-1', name: '便當店' }])
    expect(store.categories).toEqual([{ id: 'cat-1', name: '餐飲' }])
    expect(store.hasMore).toBe(true)
  })

  it('appends next pages without duplicates', async () => {
    apiMocks.fetchVendors
      .mockResolvedValueOnce({
        vendors: [{ id: 'vendor-1' }],
        total: 3,
        page: 0,
        pageSize: 1,
        hasMore: true
      })
      .mockResolvedValueOnce({
        vendors: [{ id: 'vendor-1' }, { id: 'vendor-2' }],
        total: 3,
        page: 1,
        pageSize: 1,
        hasMore: false
      })
    apiMocks.fetchVendorTradeCategories.mockResolvedValue([])

    const { useVendorsStore } = await import('./vendors')
    const store = useVendorsStore()

    await store.loadVendors({ reset: true, pageSize: 1 })
    await store.loadNextVendors()

    expect(store.vendors.map((vendor) => vendor.id)).toEqual(['vendor-1', 'vendor-2'])
    expect(store.hasMore).toBe(false)
  })

  it('saves and removes vendors locally', async () => {
    apiMocks.fetchVendorTradeCategories.mockResolvedValue([])
    apiMocks.createVendor.mockResolvedValue({ id: 'vendor-1', name: '便當店' })
    apiMocks.updateVendor.mockResolvedValue({ id: 'vendor-1', name: '便當店更新' })
    apiMocks.deleteVendor.mockResolvedValue(undefined)

    const { useVendorsStore } = await import('./vendors')
    const store = useVendorsStore()

    await store.saveVendor({ name: '便當店' } as any)
    await store.saveVendor({ name: '便當店更新' } as any, { id: 'vendor-1' })
    expect(store.vendors).toEqual([{ id: 'vendor-1', name: '便當店更新' }])

    await store.removeVendor({ id: 'vendor-1' } as any)
    expect(store.vendors).toEqual([])
    expect(store.total).toBe(0)
  })
})
