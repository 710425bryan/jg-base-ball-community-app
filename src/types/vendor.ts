export type VendorTradeCategory = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type Vendor = {
  id: string
  name: string
  trade_category: string
  contact_name: string | null
  phone: string | null
  purchase_price_note: string | null
  address: string | null
  website_url: string | null
  image_paths: string[]
  image_urls: string[]
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type VendorFormPayload = {
  name: string
  trade_category: string
  contact_name?: string | null
  phone?: string | null
  purchase_price_note?: string | null
  address?: string | null
  website_url?: string | null
  image_paths?: string[]
}

export type VendorFilters = {
  keyword?: string
  category?: string
}

export type VendorCategoryGroup = {
  category: string
  vendors: Vendor[]
}
