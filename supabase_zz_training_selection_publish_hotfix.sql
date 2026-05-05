begin;

-- Hotfix: replace the deployed publish_training_selection() body that still
-- writes training_location_assignments.location_id from an older schema.
-- Publishing a selection should only expose the selected roster and close the
-- registration window; training venue assignments use session_venue_id and are
-- managed by the training locations workflow.

create or replace function public.publish_training_selection(p_session_id uuid)
returns public.training_session_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.training_session_settings%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  update public.training_session_settings
  set
    published_at = coalesce(published_at, timezone('utc', now())),
    manual_status = case when manual_status in ('draft', 'open', 'paused') then 'closed' else manual_status end,
    updated_at = timezone('utc', now())
  where id = p_session_id
  returning *
  into v_settings;

  if v_settings.id is null then
    raise exception 'training session not found';
  end if;

  return v_settings;
end;
$$;

revoke all on function public.publish_training_selection(uuid) from public;
grant execute on function public.publish_training_selection(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
