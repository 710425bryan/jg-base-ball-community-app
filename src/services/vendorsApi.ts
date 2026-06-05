import { supabase } from '@/services/supabase'
import type { Vendor, VendorFormPayload, VendorTradeCategory } from '@/types/vendor'
import { compressImage } from '@/utils/imageCompressor'
import { normalizeVendorImagePaths, normalizeVendorText } from '@/utils/vendors'

const VENDOR_SELECT = `
  id,
  name,
  trade_category,
  contact_name,
  phone,
  purchase_price_note,
  address,
  website_url,
  image_paths,
  created_by,
  updated_by,
  created_at,
  updated_at
`

const CATEGORY_SELECT = `
  id,
  name,
  created_at,
  updated_at
`

const unique = (values: Array<string | null | undefined>) => [...new Set(values.map(normalizeVendorText).filter(Boolean))]

const normalizeCategory = (row: any): VendorTradeCategory => ({
  id: String(row?.id || ''),
  name: normalizeVendorText(row?.name),
  created_at: row?.created_at || '',
  updated_at: row?.updated_at || ''
})

const normalizeVendor = (row: any, signedUrlMap: Map<string, string> = new Map()): Vendor => {
  const imagePaths = normalizeVendorImagePaths(row?.image_paths)

  return {
    id: String(row?.id || ''),
    name: normalizeVendorText(row?.name),
    trade_category: normalizeVendorText(row?.trade_category),
    contact_name: row?.contact_name || null,
    phone: row?.phone || null,
    purchase_price_note: row?.purchase_price_note || null,
    address: row?.address || null,
    website_url: row?.website_url || null,
    image_paths: imagePaths,
    image_urls: imagePaths.map((path) => signedUrlMap.get(path)).filter(Boolean) as string[],
    created_by: row?.created_by || null,
    updated_by: row?.updated_by || null,
    created_at: row?.created_at || '',
    updated_at: row?.updated_at || ''
  }
}

const buildStoragePath = (folder: string, file: File) => {
  const extension = String(file.name || 'jpg').split('.').pop() || 'jpg'
  const random = Math.random().toString(36).slice(2, 10)
  return `${folder}/${Date.now()}_${random}.${extension}`
}

const createSignedUrlMap = async (paths: string[] = []) => {
  const imagePaths = unique(paths)
  const signedUrlMap = new Map<string, string>()

  if (imagePaths.length === 0) {
    return signedUrlMap
  }

  const { data, error } = await supabase.storage
    .from('vendors')
    .createSignedUrls(imagePaths, 60 * 60)

  if (error) throw error

  for (const item of data || []) {
    if (item.path && item.signedUrl) {
      signedUrlMap.set(item.path, item.signedUrl)
    }
  }

  return signedUrlMap
}

const normalizePayload = (payload: VendorFormPayload, imagePaths: string[] = []): VendorFormPayload => ({
  name: normalizeVendorText(payload.name),
  trade_category: normalizeVendorText(payload.trade_category),
  contact_name: normalizeVendorText(payload.contact_name) || null,
  phone: normalizeVendorText(payload.phone) || null,
  purchase_price_note: normalizeVendorText(payload.purchase_price_note) || null,
  address: normalizeVendorText(payload.address) || null,
  website_url: normalizeVendorText(payload.website_url) || null,
  image_paths: normalizeVendorImagePaths(imagePaths)
})

export const fetchVendorTradeCategories = async () => {
  const { data, error } = await supabase
    .from('vendor_trade_categories')
    .select(CATEGORY_SELECT)
    .order('name', { ascending: true })

  if (error) throw error
  return (data || []).map(normalizeCategory)
}

export const ensureVendorTradeCategory = async (name: string) => {
  const normalizedName = normalizeVendorText(name)
  if (!normalizedName) {
    throw new Error('請輸入交易類別')
  }

  const { data, error } = await supabase
    .from('vendor_trade_categories')
    .insert({ name: normalizedName })
    .select(CATEGORY_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') return null
    throw error
  }

  return normalizeCategory(data)
}

export const fetchVendors = async () => {
  const { data, error } = await supabase
    .from('vendors')
    .select(VENDOR_SELECT)
    .order('trade_category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error

  const rows = data || []
  const signedUrlMap = await createSignedUrlMap(rows.flatMap((row: any) => normalizeVendorImagePaths(row?.image_paths)))
  return rows.map((row: any) => normalizeVendor(row, signedUrlMap))
}

export const uploadVendorImage = async (file: File, folder = 'vendor_images') => {
  const compressedFile = await compressImage(file, 1600, 1200, 0.82, 900_000)
  const filePath = buildStoragePath(folder, compressedFile)

  const { error } = await supabase.storage
    .from('vendors')
    .upload(filePath, compressedFile, { upsert: false })

  if (error) throw error
  return filePath
}

export const uploadVendorImages = async (files: File[] = []) => {
  const validFiles = files.filter(Boolean)
  if (validFiles.length === 0) return [] as string[]
  return Promise.all(validFiles.map((file) => uploadVendorImage(file)))
}

const normalizeSavedVendor = async (row: any) => {
  const signedUrlMap = await createSignedUrlMap(normalizeVendorImagePaths(row?.image_paths))
  return normalizeVendor(row, signedUrlMap)
}

export const createVendor = async (payload: VendorFormPayload, imageFiles: File[] = []) => {
  const normalizedPayload = normalizePayload(payload)

  await ensureVendorTradeCategory(normalizedPayload.trade_category)

  const uploadedImagePaths = await uploadVendorImages(imageFiles)
  normalizedPayload.image_paths = normalizeVendorImagePaths(uploadedImagePaths)

  const { data, error } = await supabase
    .from('vendors')
    .insert(normalizedPayload)
    .select(VENDOR_SELECT)
    .single()

  if (error) throw error
  return normalizeSavedVendor(data)
}

export const updateVendor = async (
  vendorId: string,
  payload: VendorFormPayload,
  imageFiles: File[] = []
) => {
  const normalizedPayload = normalizePayload(payload, payload.image_paths || [])

  await ensureVendorTradeCategory(normalizedPayload.trade_category)

  const uploadedImagePaths = await uploadVendorImages(imageFiles)
  normalizedPayload.image_paths = normalizeVendorImagePaths([
    ...(normalizedPayload.image_paths || []),
    ...uploadedImagePaths
  ])

  const { data, error } = await supabase
    .from('vendors')
    .update(normalizedPayload)
    .eq('id', vendorId)
    .select(VENDOR_SELECT)
    .single()

  if (error) throw error
  return normalizeSavedVendor(data)
}

export const deleteVendor = async (vendor: Pick<Vendor, 'id' | 'image_paths'>) => {
  const { error } = await supabase.from('vendors').delete().eq('id', vendor.id)
  if (error) throw error

  const imagePaths = normalizeVendorImagePaths(vendor.image_paths)
  if (imagePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from('vendors').remove(imagePaths)
    if (storageError) {
      console.warn('Failed to remove vendor images after deleting vendor', storageError)
    }
  }
}
