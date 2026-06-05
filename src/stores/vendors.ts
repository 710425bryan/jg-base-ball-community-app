import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  VENDOR_PAGE_SIZE,
  createVendor,
  deleteVendor,
  fetchVendorTradeCategories,
  fetchVendors,
  updateVendor
} from '@/services/vendorsApi'
import type { Vendor, VendorFilters, VendorFormPayload, VendorTradeCategory } from '@/types/vendor'
import { ALL_VENDOR_CATEGORIES } from '@/utils/vendors'

export const useVendorsStore = defineStore('vendors', () => {
  const vendors = ref<Vendor[]>([])
  const categories = ref<VendorTradeCategory[]>([])
  const isLoading = ref(false)
  const isLoadingMore = ref(false)
  const isSaving = ref(false)
  const total = ref(0)
  const page = ref(0)
  const pageSize = ref(VENDOR_PAGE_SIZE)
  const hasMore = ref(false)
  const activeFilters = ref<VendorFilters>({
    keyword: '',
    category: ALL_VENDOR_CATEGORIES
  })
  const error = ref<string | null>(null)

  const vendorById = computed(() => new Map(vendors.value.map((vendor) => [vendor.id, vendor])))
  const loadedCount = computed(() => vendors.value.length)

  const mergeVendors = (nextVendors: Vendor[]) => {
    const existingIds = new Set(vendors.value.map((vendor) => vendor.id))
    vendors.value = [
      ...vendors.value,
      ...nextVendors.filter((vendor) => !existingIds.has(vendor.id))
    ]
  }

  const loadVendors = async (options: {
    reset?: boolean
    filters?: VendorFilters
    pageSize?: number
  } = {}) => {
    const shouldReset = options.reset ?? true
    const nextPageSize = options.pageSize || pageSize.value
    const filters = options.filters || activeFilters.value
    const nextPage = shouldReset ? 0 : page.value + 1

    if (!shouldReset && (!hasMore.value || isLoading.value || isLoadingMore.value)) {
      return vendors.value
    }

    if (shouldReset) {
      isLoading.value = true
      vendors.value = []
      total.value = 0
      page.value = 0
      hasMore.value = false
    } else {
      isLoadingMore.value = true
    }

    error.value = null

    try {
      const vendorPagePromise = fetchVendors({
        page: nextPage,
        pageSize: nextPageSize,
        filters
      })
      const categoryPromise = shouldReset ? fetchVendorTradeCategories() : Promise.resolve(categories.value)
      const [vendorPage, categoryRows] = await Promise.all([vendorPagePromise, categoryPromise])

      if (shouldReset) {
        vendors.value = vendorPage.vendors
      } else {
        mergeVendors(vendorPage.vendors)
      }

      activeFilters.value = { ...filters }
      page.value = vendorPage.page
      pageSize.value = vendorPage.pageSize
      total.value = vendorPage.total
      hasMore.value = vendorPage.hasMore
      categories.value = categoryRows
      return vendors.value
    } catch (err: any) {
      error.value = err?.message || '無法載入廠商資料'
      throw err
    } finally {
      isLoading.value = false
      isLoadingMore.value = false
    }
  }

  const loadNextVendors = async () => loadVendors({ reset: false })

  const refreshCategories = async () => {
    categories.value = await fetchVendorTradeCategories()
    return categories.value
  }

  const saveVendor = async (
    payload: VendorFormPayload,
    options: { id?: string | null; imageFiles?: File[] } = {}
  ) => {
    isSaving.value = true

    try {
      const saved = options.id
        ? await updateVendor(options.id, payload, options.imageFiles)
        : await createVendor(payload, options.imageFiles)

      const index = vendors.value.findIndex((vendor) => vendor.id === saved.id)
      if (index === -1) {
        vendors.value = [saved, ...vendors.value]
      } else {
        const next = [...vendors.value]
        next[index] = saved
        vendors.value = next
      }

      await refreshCategories()
      return saved
    } finally {
      isSaving.value = false
    }
  }

  const removeVendor = async (vendor: Vendor) => {
    await deleteVendor(vendor)
    vendors.value = vendors.value.filter((item) => item.id !== vendor.id)
    total.value = Math.max(0, total.value - 1)
  }

  return {
    vendors,
    categories,
    vendorById,
    loadedCount,
    isLoading,
    isLoadingMore,
    isSaving,
    total,
    page,
    pageSize,
    hasMore,
    activeFilters,
    error,
    loadVendors,
    loadNextVendors,
    refreshCategories,
    saveVendor,
    removeVendor
  }
})
