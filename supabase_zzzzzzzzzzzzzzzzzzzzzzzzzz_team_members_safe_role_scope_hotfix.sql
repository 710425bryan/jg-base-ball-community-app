-- Keep safe-roster access aligned with the product permission matrix.
-- Generic member-facing feature VIEW permissions (for example training or
-- equipment) must not expand a linked member into a full-team roster reader.

drop policy if exists "team_members_select_permitted_features" on public.team_members;

create policy "team_members_select_permitted_features"
on public.team_members
for select
to authenticated
using (
  public.has_app_permission('players', 'VIEW')
  or public.has_app_permission('players', 'EDIT')
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and public.team_members.id = any(
        coalesce(p.linked_team_member_ids, array[]::uuid[])
      )
  )
);
