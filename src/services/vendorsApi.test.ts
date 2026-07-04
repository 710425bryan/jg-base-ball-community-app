import { beforeEach, describe, expect, it, vi } from 'vitest'

const singleMock = vi.fn()
const insertSelectMock = vi.fn(() => ({ single: singleMock }))
const insertMock = vi.fn(() => ({ select: insertSelectMock }))
const categoryOrderMock = vi.fn()
const categorySelectMock = vi.fn(() => ({ order: categoryOrderMock }))
const fromMock = vi.fn((table: string) => {
  if (table === 'vendor_trade_categories') {
    return {
      insert: insertMock,
      select: categorySelectMock
    }
  }
  throw new Error(`Unexpected table: ${table}`)
})

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: fromMock,
    storage: {
      from: vi.fn()
    }
  }
}))

describe('vendorsApi category helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches and normalizes vendor trade categories', async () => {
    categoryOrderMock.mockResolvedValue({
      data: [{ id: 1, name: '  餐飲  ', created_at: '2026-07-01', updated_at: '2026-07-02' }],
      error: null
    })

    const { fetchVendorTradeCategories } = await import('./vendorsApi')

    expect(await fetchVendorTradeCategories()).toEqual([
      {
        id: '1',
        name: '餐飲',
        created_at: '2026-07-01',
        updated_at: '2026-07-02'
      }
    ])
    expect(fromMock).toHaveBeenCalledWith('vendor_trade_categories')
    expect(categoryOrderMock).toHaveBeenCalledWith('name', { ascending: true })
  })

  it('rejects blank category names and ignores duplicate category inserts', async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key' }
    })

    const { ensureVendorTradeCategory } = await import('./vendorsApi')

    await expect(ensureVendorTradeCategory('   ')).rejects.toThrow('請輸入交易類別')
    await expect(ensureVendorTradeCategory(' 餐飲 ')).resolves.toBeNull()
    expect(insertMock).toHaveBeenCalledWith({ name: '餐飲' })
  })
})
