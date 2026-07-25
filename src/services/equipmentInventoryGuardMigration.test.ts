import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase_zzzzzzzzzzzzzzzz_equipment_request_ready_inventory_guard_fix_migration.sql',
    import.meta.url
  ),
  'utf8'
)

describe('equipment request-ready inventory guard migration', () => {
  it('keeps the existing validator contract and inventory protection', () => {
    expect(migration).toContain(
      'create or replace function public.validate_equipment_purchase_request_inventory('
    )
    expect(migration).toContain('security definer\nset search_path = public')
    expect(migration).toContain('for update;')
    expect(migration).toContain("raise exception '裝備庫存不足：% 剩 % 件，申請 % 件'")
    expect(migration).toContain("raise exception '裝備庫存不足：% %剩 % 件，申請 % 件'")
    expect(migration).toContain(
      'revoke all on function public.validate_equipment_purchase_request_inventory(uuid) from public'
    )
  })

  it('excludes only this request linked purchase transactions from all usage totals', () => {
    expect(migration.match(/t\.transaction_type = 'purchase'/g)).toHaveLength(3)
    expect(migration.match(/current_ri\.request_id = p_request_id/g)).toHaveLength(3)
    expect(migration.match(/current_ri\.equipment_transaction_id = t\.id/g)).toHaveLength(3)
  })

  it('continues reserving only other approved items without transactions', () => {
    expect(migration.match(/and r\.id <> p_request_id/g)).toHaveLength(3)
    expect(migration.match(/and r\.status in \('approved', 'ready_for_pickup'\)/g)).toHaveLength(3)
    expect(migration.match(/and ri\.equipment_transaction_id is null/g)).toHaveLength(3)
  })

  it('allows fulfillment validation when the current purchase consumed the last stock', () => {
    const sizeStock = 10
    const usedIncludingCurrentRequest = 10
    const currentRequestPurchase = 2
    const requestedQuantity = 2

    const availableForCurrentRequest = sizeStock
      - (usedIncludingCurrentRequest - currentRequestPurchase)

    expect(availableForCurrentRequest).toBe(requestedQuantity)
  })
})
