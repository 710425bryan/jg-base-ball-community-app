import { describe, expect, it } from 'vitest'
import type { Vendor } from '@/types/vendor'
import {
  ALL_VENDOR_CATEGORIES,
  filterVendors,
  groupVendorsByCategory,
  normalizeVendorImagePaths
} from '@/utils/vendors'

const buildVendor = (overrides: Partial<Vendor>): Vendor => ({
  id: overrides.id || crypto.randomUUID(),
  name: overrides.name || '安新衣坊客製化服務',
  trade_category: overrides.trade_category || '服飾類',
  contact_name: overrides.contact_name ?? '陳先生',
  phone: overrides.phone ?? '02-23456789',
  purchase_price_note: overrides.purchase_price_note ?? '$700，或折扣方式',
  address: overrides.address ?? '三重區三光街23號',
  website_url: overrides.website_url ?? 'https://example.com',
  image_paths: overrides.image_paths || [],
  image_urls: overrides.image_urls || [],
  created_by: null,
  updated_by: null,
  created_at: '2026-06-05T00:00:00.000Z',
  updated_at: '2026-06-05T00:00:00.000Z',
  ...overrides
})

describe('vendors utils', () => {
  it('normalizes image paths from arrays and JSON strings', () => {
    expect(normalizeVendorImagePaths([' a.jpg ', '', 'a.jpg', 'b.jpg'])).toEqual(['a.jpg', 'b.jpg'])
    expect(normalizeVendorImagePaths('["x.jpg"," y.jpg "]')).toEqual(['x.jpg', 'y.jpg'])
    expect(normalizeVendorImagePaths('single.jpg')).toEqual(['single.jpg'])
  })

  it('filters vendors by keyword across contact fields', () => {
    const vendors = [
      buildVendor({ name: '安新衣坊客製化服務', trade_category: '服飾類', phone: '02-23456789' }),
      buildVendor({ name: 'J Ball比賽用球', trade_category: 'J Ball比賽用球', phone: '04-11112222' })
    ]

    expect(filterVendors(vendors, { keyword: '2345', category: ALL_VENDOR_CATEGORIES })).toHaveLength(1)
    expect(filterVendors(vendors, { keyword: '比賽用球', category: ALL_VENDOR_CATEGORIES })).toHaveLength(1)
  })

  it('filters and groups vendors by trade category', () => {
    const vendors = [
      buildVendor({ name: 'B店', trade_category: '交通' }),
      buildVendor({ name: 'A店', trade_category: '交通' }),
      buildVendor({ name: 'C店', trade_category: '服飾類' })
    ]

    const filtered = filterVendors(vendors, { category: '交通' })
    expect(filtered.map((vendor) => vendor.name)).toEqual(['B店', 'A店'])

    const groups = groupVendorsByCategory(vendors)
    expect(groups.map((group) => group.category)).toEqual(['交通', '服飾類'])
    expect(groups[0].vendors.map((vendor) => vendor.name)).toEqual(['A店', 'B店'])
  })
})
