begin;

alter view public.team_members_safe set (security_invoker = true);

revoke all on public.team_members_safe from public, anon, authenticated;
grant select on public.team_members_safe to authenticated, service_role;

drop policy if exists "team_members_select_permitted_features" on public.team_members;
create policy "team_members_select_permitted_features"
  on public.team_members
  for select
  to authenticated
  using (
    public.has_any_app_permission(
      array['players', 'leave_requests', 'attendance', 'fees', 'users', 'matches', 'equipment', 'training'],
      'VIEW'
    )
    or public.has_app_permission('players', 'EDIT')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and team_members.id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    )
  );

-- Keep INSERT/UPDATE/DELETE grants and policies intact. Authenticated clients
-- can read only columns exposed by team_members_safe; sensitive fields are read
-- exclusively through list_team_members_for_edit().
revoke select on public.team_members from anon, authenticated;

grant select (
  id,
  name,
  role,
  team_group,
  status,
  birth_date,
  is_early_enrollment,
  is_primary_payer,
  is_half_price,
  jersey_number,
  jersey_name,
  jersey_size,
  low_income_qualification,
  sibling_ids,
  sibling_id,
  throwing_hand,
  batting_hand,
  contact_relation,
  guardian_name,
  portrait_auth,
  notes,
  avatar_url,
  created_at,
  is_inactive_or_graduated,
  fee_billing_mode,
  joined_date,
  school_name,
  grade,
  training_program
) on public.team_members to authenticated;

grant select on public.team_members to service_role;

notify pgrst, 'reload schema';

commit;
