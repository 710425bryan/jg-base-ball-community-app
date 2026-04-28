begin;

drop policy if exists "equipment_requests_insert_linked_member" on public.equipment_purchase_requests;

create policy "equipment_requests_insert_linked_member"
  on public.equipment_purchase_requests
  for insert
  with check (
    requester_user_id = auth.uid()
    and (
      public.has_app_permission('equipment', 'CREATE')
      or public.has_app_permission('equipment', 'EDIT')
      or member_id in (
        select unnest(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        from public.profiles
        where profiles.id = auth.uid()
      )
    )
  );

commit;
