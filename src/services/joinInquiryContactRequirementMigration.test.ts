import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/20260820110213_require_join_inquiry_line_id.sql', import.meta.url),
  'utf8'
)

describe('join inquiry contact requirement migration', () => {
  it('makes phone nullable and requires a nonblank LINE ID', () => {
    expect(migration).toContain('alter column phone drop not null')
    expect(migration).toContain('alter column line_id set not null')
    expect(migration).toContain('constraint join_inquiries_line_id_not_blank')
    expect(migration).toContain("check (btrim(line_id) <> '')")
  })

  it('fails safely instead of rewriting historical inquiry data', () => {
    expect(migration).toContain("where line_id is null or btrim(line_id) = ''")
    expect(migration).toContain("raise exception 'join_inquiries contains rows without a LINE ID'")
    expect(migration).not.toMatch(/\b(update|delete|truncate)\s+(public\.)?join_inquiries\b/i)
  })
})
