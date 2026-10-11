begin;

-- VIEW is the feature entry gate. Linked players scope data only after entry is
-- authorized; CREATE/EDIT/DELETE never substitute for VIEW. The existing helper
-- includes active/access-window checks and the ADMIN bypass.
create or replace function private.assert_training_view_permission()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(public.has_app_permission('training', 'VIEW'), false) then
    raise exception using errcode = '42501', message = 'training:VIEW permission required';
  end if;
end;
$$;
revoke all on function private.assert_training_view_permission() from public, anon, authenticated;

-- Patch only the authorization prefix of installed functions. Replaying the old
-- training migration would lose later auto-selection/location return fields.
-- An unknown function shape aborts this transaction instead of silently skipping
-- a gate. All original action, ownership, window, capacity and point checks stay.
do $migration$
declare
  v_name text;
  v_function record;
  v_body text;
  v_definition text;
  v_position integer;
begin
  foreach v_name in array array[
    'list_my_training_members', 'list_training_sessions',
    'create_training_registration', 'cancel_training_registration',
    'upsert_training_session_settings', 'create_training_match_with_settings',
    'list_training_admin_registrations', 'review_training_registration',
    'publish_training_selection', 'grant_player_points',
    'list_player_point_transactions', 'delete_player_point_transactions',
    'create_training_attendance_event',
    'get_training_registration_notification_diagnostics',
    'invoke_training_registration_notification_once'
  ] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name) then
      raise exception 'Required training RPC is missing: %', v_name;
    end if;
    for v_function in
      select p.oid, p.prosrc, p.prosecdef, l.lanname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      where n.nspname = 'public' and p.proname = v_name
    loop
      v_body := replace(v_function.prosrc, E'\r\n', E'\n');
      v_definition := replace(pg_get_functiondef(v_function.oid), E'\r\n', E'\n');
      v_position := strpos(v_body, E'\nbegin\n');
      if v_function.lanname <> 'plpgsql' or not v_function.prosecdef or v_position = 0
        or strpos(v_body, 'private.assert_training_view_permission()') > 0 then
        raise exception 'Unexpected training RPC definition: %', v_function.oid::regprocedure;
      end if;
      execute replace(v_definition, v_body,
        overlay(v_body placing E'\n  perform private.assert_training_view_permission();' from v_position + 6 for 0));
      execute format('revoke all on function %s from public, anon', v_function.oid::regprocedure);
    end loop;
  end loop;
end;
$migration$;

-- Regular attendance remains independent. Only actual training attendance needs
-- the training entry permission in addition to the existing EDIT requirement.
do $migration$
declare
  v_oid regprocedure := 'public.apply_training_attendance_result(uuid,uuid,text)'::regprocedure;
  v_definition text := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_anchor text := E'  if v_session_id is null then\n    return;\n  end if;';
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'Unexpected apply_training_attendance_result definition';
  end if;
  execute replace(v_definition, v_anchor, v_anchor || E'\n\n  perform private.assert_training_view_permission();');
end;
$migration$;
revoke all on function public.apply_training_attendance_result(uuid,uuid,text) from public, anon;

-- UI-triggered automation requires VIEW+EDIT. Cron and service-role invocations
-- without a user continue to settle existing records even after role revocation.
do $migration$
declare
  v_oid regprocedure := 'public.process_training_session_automation(date)'::regprocedure;
  v_definition text := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_anchor text := E'begin\n  if auth.uid() is not null';
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'Unexpected process_training_session_automation definition';
  end if;
  execute replace(v_definition, v_anchor,
    E'begin\n  if auth.uid() is not null or current_setting(''role'', true) = ''authenticated'' then\n    perform private.assert_training_view_permission();\n  end if;\n\n  if auth.uid() is not null');
end;
$migration$;
revoke all on function public.process_training_session_automation(date) from public, anon;

-- These are internal calculations with no member authorization of their own.
-- Definer RPCs and server automation still call them as their owner.
revoke all on function public.get_player_point_balance(uuid) from public, anon, authenticated;
revoke all on function public.get_player_reserved_training_points(uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_player_available_training_points(uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_next_training_session_id(uuid) from public, anon, authenticated;
grant execute on function public.get_player_point_balance(uuid),
  public.get_player_reserved_training_points(uuid,uuid),
  public.get_player_available_training_points(uuid,uuid),
  public.get_next_training_session_id(uuid) to service_role;

-- Scheduler configuration includes server credentials. It and the due-work probe
-- are internal helpers; management diagnostics already sanitize their results.
revoke all on function public.get_training_registration_notification_config() from public, anon, authenticated;
revoke all on function public.has_due_training_registration_notifications(timestamptz) from public, anon, authenticated;
grant execute on function public.get_training_registration_notification_config(),
  public.has_due_training_registration_notifications(timestamptz) to service_role;

-- Restrictive policies AND the gate with every existing row/action policy. They
-- preserve linked-only personal access and do not grant any new raw-table writes.
do $migration$
declare v_table text;
begin
  foreach v_table in array array['training_session_settings', 'training_registrations',
    'player_point_transactions', 'training_no_show_blocks'] loop
    execute format('create policy training_view_required on public.%I as restrictive for all to public using ((select public.has_app_permission(''training'', ''VIEW''))) with check ((select public.has_app_permission(''training'', ''VIEW'')))', v_table);
  end loop;
end;
$migration$;

-- These are only the training-specific attendance policies. Independent
-- attendance feature policies keep their existing authority.
do $migration$
declare v_policy record; v_sql text; v_count integer := 0;
begin
  for v_policy in select * from pg_policies where schemaname = 'public'
    and tablename in ('attendance_events', 'attendance_records')
    and policyname like '%\_training\_%' escape '\'
  loop
    v_sql := format('alter policy %I on public.%I', v_policy.policyname, v_policy.tablename);
    if v_policy.qual is not null then
      v_sql := v_sql || format(' using ((select public.has_app_permission(''training'', ''VIEW'')) and (%s))', v_policy.qual);
    end if;
    if v_policy.with_check is not null then
      v_sql := v_sql || format(' with check ((select public.has_app_permission(''training'', ''VIEW'')) and (%s))', v_policy.with_check);
    end if;
    execute v_sql;
    v_count := v_count + 1;
  end loop;
  if v_count <> 8 then raise exception 'Expected 8 training attendance policies, got %', v_count; end if;
end;
$migration$;

-- The public feed wraps this preserved legacy implementation for coach-leave
-- items. Patch its training CTE only; targeted notifications remain owner-only.
do $migration$
declare
  v_oid regprocedure := 'private.notification_feed_before_coach_leave(integer,boolean)'::regprocedure;
  v_definition text := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_anchor text := E'where pde.feature = ''training''\n      and pde.action = ''VIEW''';
begin
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'Unexpected training notification feed definition';
  end if;
  execute replace(v_definition, v_anchor,
    v_anchor || E'\n      and public.has_app_permission(''training'', ''VIEW'')');
end;
$migration$;

notify pgrst, 'reload schema';
commit;
