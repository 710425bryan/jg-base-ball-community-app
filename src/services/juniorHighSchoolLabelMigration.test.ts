import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz_junior_high_school_label_migration.sql',
    import.meta.url
  ),
  'utf8'
)

describe('junior-high school label migration', () => {
  it('renames the persisted program and fee-setting descriptions without changing keys', () => {
    expect(migration).toContain("label = '國中部'")
    expect(migration).toContain("where program_key = 'junior_high_school_team'")
    expect(migration).toContain("description = '國中部單次月費與訓練日期計費設定'")
    expect(migration).toContain("where key = 'xintai_monthly_per_session_defaults'")
  })
})
