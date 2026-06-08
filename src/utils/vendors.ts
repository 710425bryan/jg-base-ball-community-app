import type { Vendor, VendorCategoryGroup, VendorFilters } from '@/types/vendor'

export const ALL_VENDOR_CATEGORIES = 'all'
export const UNCATEGORIZED_VENDOR_CATEGORY = '未分類'

export const normalizeVendorText = (value?: string | null) => String(value || '').trim()

export const normalizeVendorImagePaths = (value: unknown): string[] => {
  let values: unknown[] = []

  if (Array.isArray(value)) {
    values = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        values = Array.isArray(parsed) ? parsed : [trimmed]
      } catch {
        values = [trimmed]
      }
    } else if (trimmed) {
      values = [trimmed]
    }
  }

  const paths = values
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)

  return [...new Set(paths)]
}

export const buildVendorSearchContent = (vendor: Pick<
  Vendor,
  'name' | 'trade_category' | 'contact_name' | 'phone' | 'purchase_price_note' | 'address' | 'website_url'
>) => [
  vendor.name,
  vendor.trade_category,
  vendor.contact_name,
  vendor.phone,
  vendor.purchase_price_note,
  vendor.address,
  vendor.website_url
].map(normalizeVendorText).filter(Boolean).join(' ').toLowerCase()

export const filterVendors = (vendors: Vendor[], filters: VendorFilters = {}) => {
  const keyword = normalizeVendorText(filters.keyword).toLowerCase()
  const category = normalizeVendorText(filters.category || ALL_VENDOR_CATEGORIES)

  return vendors.filter((vendor) => {
    const matchesCategory = category === ALL_VENDOR_CATEGORIES || vendor.trade_category === category
    const matchesKeyword = !keyword || buildVendorSearchContent(vendor).includes(keyword)
    return matchesCategory && matchesKeyword
  })
}

export const groupVendorsByCategory = (vendors: Vendor[]): VendorCategoryGroup[] => {
  const grouped = new Map<string, Vendor[]>()

  for (const vendor of vendors) {
    const category = normalizeVendorText(vendor.trade_category) || UNCATEGORIZED_VENDOR_CATEGORY
    if (!grouped.has(category)) grouped.set(category, [])
    grouped.get(category)?.push(vendor)
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'zh-Hant'))
    .map(([category, rows]) => ({
      category,
      vendors: [...rows].sort((left, right) => left.name.localeCompare(right.name, 'zh-Hant'))
    }))
}
