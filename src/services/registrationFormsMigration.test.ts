import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../supabase_registration_forms_migration.sql', import.meta.url),
  'utf8'
)

describe('registration forms migration', () => {
  it('creates metadata and privacy-minimized generation log tables with RLS', () => {
    expect(source).toContain('create table if not exists public.registration_form_templates')
    expect(source).toContain('create table if not exists public.registration_form_generation_logs')
    expect(source).toContain('alter table public.registration_form_templates enable row level security')
    expect(source).toContain('alter table public.registration_form_generation_logs enable row level security')
    const logTable = source.slice(
      source.indexOf('create table if not exists public.registration_form_generation_logs'),
      source.indexOf('comment on table public.registration_form_templates')
    )
    expect(logTable).not.toContain('member_id')
    expect(logTable).not.toContain('personal')
  })

  it('creates a private 10 MB OOXML-only bucket and feature policies', () => {
    expect(source).toContain("'registration-forms'")
    expect(source).toMatch(/'registration-forms',\s*'registration-forms',\s*false,\s*10485760/)
    expect(source).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(source).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(source).toContain("public.has_app_permission('registration_forms', 'VIEW')")
    expect(source).toContain("public.has_app_permission('registration_forms', 'DELETE')")
  })

  it('grants all registration form actions only to ADMIN by default', () => {
    for (const action of ['VIEW', 'CREATE', 'EDIT', 'DELETE']) {
      expect(source).toContain(`('ADMIN', 'registration_forms', '${action}')`)
    }
    expect(source).not.toMatch(/\('(?!ADMIN')[^']+', 'registration_forms'/)
  })
})
