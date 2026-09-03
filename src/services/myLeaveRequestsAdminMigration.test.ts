import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/20260903091633_admin_my_leave_all_members.sql', import.meta.url),
  'utf8'
)

describe('ADMIN my-leave all-member migration', () => {
  it('keeps all four RPCs on the same exact ADMIN or linked-member boundary', () => {
    expect(migration).toContain('create or replace function public.list_my_leave_members()')
    expect(migration).toContain('create or replace function public.list_my_leave_requests(')
    expect(migration).toContain('create or replace function public.create_my_leave_requests(')
    expect(migration).toContain('create or replace function public.delete_my_leave_request(')
    expect(migration.match(/public\.current_profile_role\(\) = 'ADMIN'/g)).toHaveLength(4)
    expect(migration).toContain('tm.id = any(cp.linked_member_ids) as is_linked')
    expect(migration).toContain("raise exception 'member not linked to current profile'")
    expect(migration).toContain("raise exception 'leave request not deletable by current profile'")
    expect(migration).toContain('not coalesce(p_member_id = any(v_linked_member_ids), false)')
  })

  it('returns linked members first while excluding inactive roster members from new leave requests', () => {
    expect(migration).toContain('case when tm.id = any(cp.linked_member_ids) then 0 else 1 end')
    expect(migration).toContain("coalesce(tm.status, '在隊') not in ('退隊', '離隊')")
    expect(migration).toContain('coalesce(tm.is_inactive_or_graduated, false) = false')
    expect(migration).toContain("raise exception 'member not found or inactive'")
    expect(migration).toContain('public.normalize_leave_time_segment')
  })

  it('prevents self-escalation through profile role or member binding updates', () => {
    expect(migration).toContain('old.role is distinct from new.role')
    expect(migration).toContain('old.linked_team_member_ids is distinct from new.linked_team_member_ids')
    expect(migration).toContain("public.has_app_permission('users', 'EDIT')")
    expect(migration).toContain('create trigger profiles_access_admin_guard')
    expect(migration).toContain('revoke all on function public.enforce_profile_access_admin_guard() from public, anon, authenticated, service_role;')
    expect(migration).toContain('revoke all on function public.update_my_profile_settings(text, text, text, text) from public, anon, authenticated, service_role;')
    expect(migration).toContain('grant execute on function public.update_my_profile_settings(text, text, text, text) to authenticated, service_role;')
    expect(migration).toContain('revoke all on function public.touch_profile_last_seen() from public, anon, authenticated, service_role;')
    expect(migration).toContain('grant execute on function public.admin_update_profile(uuid, text, text, text, text, uuid[], boolean, timestamptz, timestamptz) to authenticated, service_role;')
  })

  it('removes anonymous execution and grants the leave RPCs only to authenticated and service roles', () => {
    expect(migration).toContain('revoke all on function public.list_my_leave_members() from public, anon, authenticated, service_role;')
    expect(migration).toContain('revoke all on function public.list_my_leave_requests(uuid) from public, anon, authenticated, service_role;')
    expect(migration).toContain('revoke all on function public.create_my_leave_requests(uuid, jsonb) from public, anon, authenticated, service_role;')
    expect(migration).toContain('revoke all on function public.delete_my_leave_request(uuid) from public, anon, authenticated, service_role;')
    expect(migration).toContain('grant execute on function public.list_my_leave_members() to authenticated, service_role;')
    expect(migration).toContain('grant execute on function public.delete_my_leave_request(uuid) to authenticated, service_role;')
  })
})
