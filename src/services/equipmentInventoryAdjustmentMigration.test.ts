import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase_zzzzzzzzzzzzzzz_equipment_stock_out_adjustment_migration.sql', import.meta.url),
  'utf8'
)

describe('equipment stock-out adjustment migration', () => {
  it('keeps the existing RPC signature and adds stock-out ledger support', () => {
    expect(migration).toContain("check (adjustment_type in ('stock_in', 'stock_out'))")
    expect(migration).toContain('create or replace function public.create_equipment_inventory_adjustment(')
    expect(migration).toContain("when v_signed_quantity < 0 then 'stock_out'")
    expect(migration).toContain('v_quantity integer := abs(coalesce(p_quantity_delta, 0))')
    expect(migration).toContain('v_adjustment_type,')
  })

  it('requires edit permission and a reason before reducing stock', () => {
    expect(migration).toContain('for insert\n  to authenticated\n  with check')
    expect(migration).toContain("public.has_app_permission('equipment', 'EDIT')")
    expect(migration).toContain("raise exception '沒有減少裝備庫存的權限'")
    expect(migration).toContain("raise exception '減少庫存時必須填寫原因'")
  })

  it('locks equipment and guards both used and reserved overall and size inventory', () => {
    expect(migration).toContain('for update;')
    expect(migration).toContain("t.transaction_type in ('borrow', 'receive', 'purchase')")
    expect(migration).toContain("r.status in ('approved', 'ready_for_pickup')")
    expect(migration).toContain('and ri.equipment_transaction_id is null')
    expect(migration).toContain("raise exception '可用庫存不足，目前最多可減少 % 件'")
    expect(migration).toContain("raise exception '尺寸 % 可用庫存不足，目前最多可減少 % 件'")
  })
})
