import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../supabase_registration_forms_migration.sql', import.meta.url),
  'utf8'
)
const eventSource = readFileSync(
  new URL('../../supabase/migrations/20260818075514_registration_form_events.sql', import.meta.url),
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

  it('adds event-centered registration metadata and reusable template links without player data', () => {
    expect(eventSource).toContain('create table public.registration_form_events')
    expect(eventSource).toContain('create table public.registration_form_event_templates')
    expect(eventSource).toContain('add column if not exists event_id uuid')
    expect(eventSource).toContain('event_name_snapshot text')
    const eventTables = eventSource.slice(
      eventSource.indexOf('create table public.registration_form_events'),
      eventSource.indexOf('alter table public.registration_form_generation_logs')
    )
    expect(eventTables).not.toContain('member_id')
    expect(eventTables).not.toContain('national_id')
  })

  it('protects event writes with existing feature actions and an invoker RPC', () => {
    expect(eventSource).toContain('alter table public.registration_form_events enable row level security')
    expect(eventSource).toContain('alter table public.registration_form_event_templates enable row level security')
    expect(eventSource).toContain("public.has_app_permission('registration_forms', 'VIEW')")
    expect(eventSource).toContain("public.has_app_permission('registration_forms', 'CREATE')")
    expect(eventSource).toContain("public.has_app_permission('registration_forms', 'EDIT')")
    expect(eventSource).toContain("public.has_app_permission('registration_forms', 'DELETE')")
    expect(eventSource).toMatch(/save_registration_form_event\([\s\S]*?security invoker/)
    expect(eventSource).not.toContain('security definer')
    expect(eventSource).toContain('grant select, insert, update, delete on public.registration_form_events to authenticated, service_role')
    expect(eventSource).toContain('registration_form_events_created_by_idx')
    expect(eventSource).toContain('registration_form_events_updated_by_idx')
    expect(eventSource).toContain('registration_form_event_templates_created_by_idx')
  })
})
