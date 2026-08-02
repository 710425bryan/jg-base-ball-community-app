import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase_my_home_next_match_week_window_migration.sql', import.meta.url),
  'utf8'
)

describe('my home next-match week-window migration', () => {
  it('keeps the existing RPC contract and linked-member security boundary', () => {
    expect(migration).toContain('create or replace function public.get_my_home_next_event(')
    expect(migration).toContain('p_member_id uuid default null')
    expect(migration).toContain('p_today date default current_date')
    expect(migration).toContain('security definer')
    expect(migration).toContain('set search_path = public')
    expect(migration).toContain("raise exception 'Not authenticated'")
    expect(migration).toContain("raise exception 'member not linked to current profile'")
    expect(migration).toContain('revoke all on function public.get_my_home_next_event(uuid, date) from public')
    expect(migration).toContain('revoke all on function public.get_my_home_next_event(uuid, date) from anon')
    expect(migration).toContain('grant execute on function public.get_my_home_next_event(uuid, date) to authenticated, service_role')
  })

  it('returns no event without a selected member and limits matches to seven calendar dates', () => {
    expect(migration).toContain('if p_member_id is null then')
    expect(migration).toContain('return null;')
    expect(migration).toContain('m.match_date between v_today and (v_today + 6)')
    expect(migration).toContain("btrim(coalesce(m.match_level, '')) <> '特訓課'")
    expect(migration).toContain('or event_end_time > v_current_time')
  })

  it('requires the selected member to be present in the saved match roster', () => {
    expect(migration).toContain('from public.split_match_fee_player_names(m.players) parsed_player')
    expect(migration).toContain('public.normalize_match_fee_player_name(parsed_player.player_name)')
    expect(migration).toContain('public.normalize_match_fee_player_name(v_member_name)')
    expect(migration).not.toContain('training_registrations')
  })
})
