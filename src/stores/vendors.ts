import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createVendor,
  deleteVendor,
  fetchVendorTradeCategories,
  fetchVendors,
  updateVendor
} from '@/services/vendorsApi'
import type { Vendor, VendorFormPayload, VendorTradeCategory } from '@/types/vendor'

export const useVendorsStore = defineStore('vendors', () => {
  const vendors = ref<Vendor[]>([])
  const categories = ref<VendorTradeCategory[]>([])
  const isLoading = ref(false)
  const isSaving = ref(false)
  const error = ref<string | null>(null)

  const vendorById = computed(() => new Map(vendors.value.map((vendor) => [vendor.id, vendor])))

  const loadVendors = async () => {
    isLoading.value = true
    error.value = null

    try {
      const [vendorRows, categoryRows] = await Promise.all([
        fetchVendors(),
        fetchVendorTradeCategories()
      ])

      vendors.value = vendorRows
      categories.value = categoryRows
      return vendors.value
    } catch (err: any) {
      error.value = err?.message || '無法載入廠商資料'
      throw err
    } finally {
      isLoading.value = false
    }
  }

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
  }

  return {
    vendors,
    categories,
    vendorById,
    isLoading,
    isSaving,
    error,
    loadVendors,
    refreshCategories,
    saveVendor,
    removeVendor
  }
})
