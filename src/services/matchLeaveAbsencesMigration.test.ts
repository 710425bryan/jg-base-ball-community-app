import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase_zzzzzzzzzzzzzzzzz_historical_match_leave_absences_migration.sql', import.meta.url),
  'utf8'
)

describe('historical match leave absence migration', () => {
  it('keeps historical matches in preview, detail, and persisted synchronization', () => {
    expect(migration).toContain('create or replace function public.preview_match_leave_absences(')
    expect(migration).toContain('create or replace function public.get_match_leave_absences(')
    expect(migration).toContain('create or replace function public.sync_match_leave_absences_for_match(')
    expect(migration).toContain('create or replace function public.sync_match_leave_absences_after_leave_change()')
    expect(migration).not.toContain('p_match_date < v_today')
    expect(migration).not.toContain('v_match.match_date < v_today')
    expect(migration).not.toContain('matches.match_date >= v_today')
  })

  it('preserves manual absence rows and backfills existing dated matches', () => {
    expect(migration).toContain("where coalesce(entry.value ->> 'source', '') <> 'leave_request'")
    expect(migration).toContain("v_next_absences := coalesce(v_manual_absences, '[]'::jsonb)")
    expect(migration).toContain('where matches.match_date is not null')
    expect(migration).toContain('perform public.sync_match_leave_absences_for_match(v_match_id)')
  })
})
