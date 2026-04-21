begin;

create or replace function public.current_profile_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.has_app_permission(
  p_feature text,
  p_action text default 'VIEW'
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_role := public.current_profile_role();

  if v_role is null then
    return false;
  end if;

  if v_role = 'ADMIN' then
    return true;
  end if;

  return exists (
    select 1
    from public.app_role_permissions arp
    where arp.role_key = v_role
      and arp.feature = coalesce(p_feature, '')
      and arp.action = coalesce(nullif(p_action, ''), 'VIEW')
  );
end;
$$;

create or replace function public.has_any_app_permission(
  p_features text[],
  p_action text default 'VIEW'
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return false;
  end if;

  v_role := public.current_profile_role();

  if v_role is null then
    return false;
  end if;

  if v_role = 'ADMIN' then
    return true;
  end if;

  return exists (
    select 1
    from public.app_role_permissions arp
    where arp.role_key = v_role
      and arp.action = coalesce(nullif(p_action, ''), 'VIEW')
      and arp.feature = any(coalesce(p_features, array[]::text[]))
  );
end;
$$;

create or replace function public.mask_display_name(p_name text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(p_name, '')), '') is null then '匿名'
    when char_length(p_name) = 1 then p_name
    when char_length(p_name) = 2 then left(p_name, 1) || '*'
    else left(p_name, 1) || repeat('*', greatest(char_length(p_name) - 2, 1)) || right(p_name, 1)
  end;
$$;

create or replace function public.can_request_magic_link(p_email text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select case
    when nullif(lower(btrim(coalesce(p_email, ''))), '') is null then false
    else exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(btrim(p_email))
        and coalesce(p.is_active, true)
        and (p.access_start is null or p.access_start <= current_date)
        and (p.access_end is null or p.access_end >= current_date)
    )
  end;
$$;

create or replace function public.get_public_landing_snapshot(p_today date default current_date)
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with target_day as (
    select coalesce(p_today, current_date) as day
  ),
  today_event as (
    select
      ae.id,
      jsonb_build_object(
        'id', ae.id,
        'title', ae.title,
        'date', ae.date,
        'event_type', ae.event_type
      ) as payload
    from public.attendance_events ae
    cross join target_day td
    where ae.date = td.day
    order by ae.created_at asc
    limit 1
  ),
  masked_names as (
    select distinct public.mask_display_name(tm.name) as masked_name
    from public.leave_requests lr
    join public.team_members tm
      on tm.id = lr.user_id
    cross join target_day td
    where lr.start_date <= td.day
      and lr.end_date >= td.day

    union

    select distinct public.mask_display_name(tm.name) as masked_name
    from public.attendance_records ar
    join public.team_members tm
      on tm.id = ar.member_id
    join today_event te
      on te.id = ar.event_id
    where ar.status = '請假'
  ),
  leave_summary as (
    select
      coalesce(jsonb_agg(masked_name order by masked_name), '[]'::jsonb) as names,
      count(*)::integer as total
    from masked_names
  ),
  upcoming_matches as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'match_name', m.match_name,
          'opponent', m.opponent,
          'match_date', m.match_date,
          'match_time', m.match_time,
          'location', m.location,
          'category_group', m.category_group
        )
        order by m.match_date asc, m.match_time asc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        matches.id,
        matches.match_name,
        matches.opponent,
        matches.match_date,
        matches.match_time,
        matches.location,
        matches.category_group
      from public.matches
      cross join target_day td
      where matches.match_date >= td.day
      order by matches.match_date asc, matches.match_time asc
      limit 3
    ) m
  ),
  recent_announcements as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'title', a.title,
          'content', a.content,
          'created_at', a.created_at,
          'is_pinned', a.is_pinned,
          'image_url', a.image_url
        )
        order by a.is_pinned desc, a.created_at desc
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        ann.id,
        ann.title,
        ann.content,
        ann.created_at,
        ann.is_pinned,
        ann.image_url
      from public.announcements ann
      order by ann.is_pinned desc, ann.created_at desc
      limit 3
    ) a
  )
  select jsonb_build_object(
    'todayEvent', (select payload from today_event),
    'todayLeaveNames', coalesce((select names from leave_summary), '[]'::jsonb),
    'todayLeaveCount', coalesce((select total from leave_summary), 0),
    'upcomingMatches', coalesce((select payload from upcoming_matches), '[]'::jsonb),
    'latestAnnouncements', coalesce((select payload from recent_announcements), '[]'::jsonb)
  );
$$;

drop function if exists public.admin_insert_profile(uuid, text, text, text, text, text);

create or replace function public.admin_insert_profile(
  target_id uuid,
  p_email text,
  p_name text,
  p_nickname text default null,
  p_role text default 'COACH',
  p_avatar text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_email text := lower(nullif(btrim(p_email), ''));
  v_name text := nullif(btrim(p_name), '');
  v_nickname text := nullif(btrim(p_nickname), '');
  v_role text := coalesce(nullif(btrim(p_role), ''), 'COACH');
  v_avatar text := nullif(btrim(p_avatar), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('users', 'CREATE') then
    raise exception 'users:CREATE permission required';
  end if;

  if target_id is null then
    raise exception 'target_id is required';
  end if;

  if v_email is null then
    raise exception 'email is required';
  end if;

  if v_name is null then
    raise exception 'name is required';
  end if;

  insert into public.profiles (
    id,
    email,
    name,
    nickname,
    role,
    avatar_url,
    created_at,
    updated_at
  )
  values (
    target_id,
    v_email,
    v_name,
    v_nickname,
    v_role,
    v_avatar,
    now(),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    nickname = excluded.nickname,
    role = excluded.role,
    avatar_url = excluded.avatar_url,
    updated_at = now()
  returning *
  into v_profile;

  return v_profile;
end;
$$;

drop function if exists public.admin_delete_user(uuid);

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('users', 'DELETE') then
    raise exception 'users:DELETE permission required';
  end if;

  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot delete current user';
  end if;

  delete from public.profiles
  where id = target_user_id;

  delete from auth.users
  where id = target_user_id;
end;
$$;

drop view if exists public.team_members_safe;

create view public.team_members_safe
with (security_invoker = true)
as
select
  tm.id,
  tm.name,
  tm.role,
  tm.team_group,
  tm.status,
  tm.birth_date,
  tm.is_early_enrollment,
  tm.is_primary_payer,
  tm.is_half_price,
  tm.jersey_number,
  tm.jersey_name,
  tm.jersey_size,
  tm.low_income_qualification,
  tm.sibling_ids,
  tm.sibling_id,
  tm.throwing_hand,
  tm.batting_hand,
  tm.contact_relation,
  tm.guardian_name,
  tm.portrait_auth,
  tm.notes,
  tm.avatar_url,
  tm.created_at
from public.team_members tm;

grant select on public.team_members_safe to anon, authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.leave_requests enable row level security;
alter table public.join_inquiries enable row level security;
alter table public.announcements enable row level security;
alter table public.attendance_events enable row level security;
alter table public.attendance_records enable row level security;
alter table public.matches enable row level security;
alter table public.fee_settings enable row level security;
alter table public.monthly_fees enable row level security;
alter table public.quarterly_fees enable row level security;
alter table public.profile_payment_submissions enable row level security;

drop policy if exists "profiles_select_self_or_users_view" on public.profiles;
create policy "profiles_select_self_or_users_view"
  on public.profiles
  for select
  using (
    auth.uid() = id
    or public.has_app_permission('users', 'VIEW')
  );

drop policy if exists "profiles_update_self_or_users_edit" on public.profiles;
create policy "profiles_update_self_or_users_edit"
  on public.profiles
  for update
  using (
    auth.uid() = id
    or public.has_app_permission('users', 'EDIT')
  )
  with check (
    auth.uid() = id
    or public.has_app_permission('users', 'EDIT')
  );

drop policy if exists "team_members_select_permitted_features" on public.team_members;
create policy "team_members_select_permitted_features"
  on public.team_members
  for select
  using (
    public.has_any_app_permission(
      array['players', 'leave_requests', 'attendance', 'fees', 'users', 'matches'],
      'VIEW'
    )
  );

drop policy if exists "team_members_insert_players_create" on public.team_members;
create policy "team_members_insert_players_create"
  on public.team_members
  for insert
  with check (public.has_app_permission('players', 'CREATE'));

drop policy if exists "team_members_update_players_edit" on public.team_members;
create policy "team_members_update_players_edit"
  on public.team_members
  for update
  using (public.has_app_permission('players', 'EDIT'))
  with check (public.has_app_permission('players', 'EDIT'));

drop policy if exists "team_members_delete_players_delete" on public.team_members;
create policy "team_members_delete_players_delete"
  on public.team_members
  for delete
  using (public.has_app_permission('players', 'DELETE'));

drop policy if exists "leave_requests_select_leave_or_attendance_view" on public.leave_requests;
create policy "leave_requests_select_leave_or_attendance_view"
  on public.leave_requests
  for select
  using (
    public.has_app_permission('leave_requests', 'VIEW')
    or public.has_app_permission('attendance', 'VIEW')
  );

drop policy if exists "leave_requests_insert_leave_create" on public.leave_requests;
create policy "leave_requests_insert_leave_create"
  on public.leave_requests
  for insert
  with check (public.has_app_permission('leave_requests', 'CREATE'));

drop policy if exists "leave_requests_update_leave_edit" on public.leave_requests;
create policy "leave_requests_update_leave_edit"
  on public.leave_requests
  for update
  using (public.has_app_permission('leave_requests', 'EDIT'))
  with check (public.has_app_permission('leave_requests', 'EDIT'));

drop policy if exists "leave_requests_delete_leave_delete" on public.leave_requests;
create policy "leave_requests_delete_leave_delete"
  on public.leave_requests
  for delete
  using (public.has_app_permission('leave_requests', 'DELETE'));

drop policy if exists "join_inquiries_insert_public" on public.join_inquiries;
create policy "join_inquiries_insert_public"
  on public.join_inquiries
  for insert
  with check (true);

drop policy if exists "join_inquiries_select_view" on public.join_inquiries;
create policy "join_inquiries_select_view"
  on public.join_inquiries
  for select
  using (public.has_app_permission('join_inquiries', 'VIEW'));

drop policy if exists "join_inquiries_update_edit" on public.join_inquiries;
create policy "join_inquiries_update_edit"
  on public.join_inquiries
  for update
  using (public.has_app_permission('join_inquiries', 'EDIT'))
  with check (public.has_app_permission('join_inquiries', 'EDIT'));

drop policy if exists "join_inquiries_delete_delete" on public.join_inquiries;
create policy "join_inquiries_delete_delete"
  on public.join_inquiries
  for delete
  using (public.has_app_permission('join_inquiries', 'DELETE'));

drop policy if exists "announcements_select_view" on public.announcements;
create policy "announcements_select_view"
  on public.announcements
  for select
  using (public.has_app_permission('announcements', 'VIEW'));

drop policy if exists "announcements_insert_create" on public.announcements;
create policy "announcements_insert_create"
  on public.announcements
  for insert
  with check (public.has_app_permission('announcements', 'CREATE'));

drop policy if exists "announcements_update_edit" on public.announcements;
create policy "announcements_update_edit"
  on public.announcements
  for update
  using (public.has_app_permission('announcements', 'EDIT'))
  with check (public.has_app_permission('announcements', 'EDIT'));

drop policy if exists "announcements_delete_delete" on public.announcements;
create policy "announcements_delete_delete"
  on public.announcements
  for delete
  using (public.has_app_permission('announcements', 'DELETE'));

drop policy if exists "attendance_events_select_view" on public.attendance_events;
create policy "attendance_events_select_view"
  on public.attendance_events
  for select
  using (public.has_app_permission('attendance', 'VIEW'));

drop policy if exists "attendance_events_insert_create" on public.attendance_events;
create policy "attendance_events_insert_create"
  on public.attendance_events
  for insert
  with check (public.has_app_permission('attendance', 'CREATE'));

drop policy if exists "attendance_events_update_edit" on public.attendance_events;
create policy "attendance_events_update_edit"
  on public.attendance_events
  for update
  using (public.has_app_permission('attendance', 'EDIT'))
  with check (public.has_app_permission('attendance', 'EDIT'));

drop policy if exists "attendance_events_delete_delete" on public.attendance_events;
create policy "attendance_events_delete_delete"
  on public.attendance_events
  for delete
  using (public.has_app_permission('attendance', 'DELETE'));

drop policy if exists "attendance_records_select_view" on public.attendance_records;
create policy "attendance_records_select_view"
  on public.attendance_records
  for select
  using (public.has_app_permission('attendance', 'VIEW'));

drop policy if exists "attendance_records_insert_create" on public.attendance_records;
create policy "attendance_records_insert_create"
  on public.attendance_records
  for insert
  with check (public.has_app_permission('attendance', 'CREATE'));

drop policy if exists "attendance_records_update_edit" on public.attendance_records;
create policy "attendance_records_update_edit"
  on public.attendance_records
  for update
  using (public.has_app_permission('attendance', 'EDIT'))
  with check (public.has_app_permission('attendance', 'EDIT'));

drop policy if exists "attendance_records_delete_delete" on public.attendance_records;
create policy "attendance_records_delete_delete"
  on public.attendance_records
  for delete
  using (public.has_app_permission('attendance', 'DELETE'));

drop policy if exists "matches_select_view" on public.matches;
create policy "matches_select_view"
  on public.matches
  for select
  using (public.has_app_permission('matches', 'VIEW'));

drop policy if exists "matches_insert_create" on public.matches;
create policy "matches_insert_create"
  on public.matches
  for insert
  with check (public.has_app_permission('matches', 'CREATE'));

drop policy if exists "matches_update_edit" on public.matches;
create policy "matches_update_edit"
  on public.matches
  for update
  using (public.has_app_permission('matches', 'EDIT'))
  with check (public.has_app_permission('matches', 'EDIT'));

drop policy if exists "matches_delete_delete" on public.matches;
create policy "matches_delete_delete"
  on public.matches
  for delete
  using (public.has_app_permission('matches', 'DELETE'));

drop policy if exists "Enable all metadata management for admins" on public.fee_settings;
drop policy if exists "fee_settings_select_view" on public.fee_settings;
create policy "fee_settings_select_view"
  on public.fee_settings
  for select
  using (public.has_app_permission('fees', 'VIEW'));

drop policy if exists "fee_settings_insert_create" on public.fee_settings;
create policy "fee_settings_insert_create"
  on public.fee_settings
  for insert
  with check (public.has_app_permission('fees', 'CREATE'));

drop policy if exists "fee_settings_update_edit" on public.fee_settings;
create policy "fee_settings_update_edit"
  on public.fee_settings
  for update
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "fee_settings_delete_delete" on public.fee_settings;
create policy "fee_settings_delete_delete"
  on public.fee_settings
  for delete
  using (public.has_app_permission('fees', 'DELETE'));

drop policy if exists "Enable all monthly fees management for admins" on public.monthly_fees;
drop policy if exists "monthly_fees_select_view" on public.monthly_fees;
create policy "monthly_fees_select_view"
  on public.monthly_fees
  for select
  using (public.has_app_permission('fees', 'VIEW'));

drop policy if exists "monthly_fees_insert_create" on public.monthly_fees;
create policy "monthly_fees_insert_create"
  on public.monthly_fees
  for insert
  with check (public.has_app_permission('fees', 'CREATE'));

drop policy if exists "monthly_fees_update_edit" on public.monthly_fees;
create policy "monthly_fees_update_edit"
  on public.monthly_fees
  for update
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "monthly_fees_delete_delete" on public.monthly_fees;
create policy "monthly_fees_delete_delete"
  on public.monthly_fees
  for delete
  using (public.has_app_permission('fees', 'DELETE'));

drop policy if exists "Enable all quarterly fees management for admins" on public.quarterly_fees;
drop policy if exists "Enable insert for anon" on public.quarterly_fees;
drop policy if exists "quarterly_fees_select_view" on public.quarterly_fees;
create policy "quarterly_fees_select_view"
  on public.quarterly_fees
  for select
  using (public.has_app_permission('fees', 'VIEW'));

drop policy if exists "quarterly_fees_select_access" on public.quarterly_fees;
drop policy if exists "quarterly_fees_insert_create" on public.quarterly_fees;
create policy "quarterly_fees_insert_create"
  on public.quarterly_fees
  for insert
  with check (public.has_app_permission('fees', 'CREATE'));

drop policy if exists "quarterly_fees_insert_access" on public.quarterly_fees;
drop policy if exists "quarterly_fees_update_edit" on public.quarterly_fees;
create policy "quarterly_fees_update_edit"
  on public.quarterly_fees
  for update
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "quarterly_fees_update_access" on public.quarterly_fees;
drop policy if exists "quarterly_fees_delete_delete" on public.quarterly_fees;
create policy "quarterly_fees_delete_delete"
  on public.quarterly_fees
  for delete
  using (public.has_app_permission('fees', 'DELETE'));

drop policy if exists "quarterly_fees_delete_access" on public.quarterly_fees;

drop policy if exists "Enable profile payment submission select for own profile" on public.profile_payment_submissions;
drop policy if exists "profile_payment_submissions_select_own_profile" on public.profile_payment_submissions;
create policy "profile_payment_submissions_select_own_profile"
  on public.profile_payment_submissions
  for select
  using (profile_id = auth.uid());

drop policy if exists "profile_payment_submissions_select_fees_view" on public.profile_payment_submissions;
create policy "profile_payment_submissions_select_fees_view"
  on public.profile_payment_submissions
  for select
  using (public.has_app_permission('fees', 'VIEW'));

drop policy if exists "Enable profile payment submission insert for own profile" on public.profile_payment_submissions;
drop policy if exists "profile_payment_submissions_insert_own_profile" on public.profile_payment_submissions;
create policy "profile_payment_submissions_insert_own_profile"
  on public.profile_payment_submissions
  for insert
  with check (profile_id = auth.uid());

drop policy if exists "profile_payment_submissions_insert_fees_create" on public.profile_payment_submissions;
create policy "profile_payment_submissions_insert_fees_create"
  on public.profile_payment_submissions
  for insert
  with check (public.has_app_permission('fees', 'CREATE'));

drop policy if exists "Enable profile payment submission admin management" on public.profile_payment_submissions;
drop policy if exists "profile_payment_submissions_update_fees_edit" on public.profile_payment_submissions;
create policy "profile_payment_submissions_update_fees_edit"
  on public.profile_payment_submissions
  for update
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

drop policy if exists "profile_payment_submissions_delete_fees_delete" on public.profile_payment_submissions;
create policy "profile_payment_submissions_delete_fees_delete"
  on public.profile_payment_submissions
  for delete
  using (public.has_app_permission('fees', 'DELETE'));

revoke all on function public.current_profile_role() from public;
grant execute on function public.current_profile_role() to anon, authenticated, service_role;

revoke all on function public.has_app_permission(text, text) from public;
grant execute on function public.has_app_permission(text, text) to anon, authenticated, service_role;

revoke all on function public.has_any_app_permission(text[], text) from public;
grant execute on function public.has_any_app_permission(text[], text) to anon, authenticated, service_role;

revoke all on function public.can_request_magic_link(text) from public;
grant execute on function public.can_request_magic_link(text) to anon, authenticated, service_role;

revoke all on function public.get_public_landing_snapshot(date) from public;
grant execute on function public.get_public_landing_snapshot(date) to anon, authenticated, service_role;

revoke all on function public.admin_insert_profile(uuid, text, text, text, text, text) from public;
grant execute on function public.admin_insert_profile(uuid, text, text, text, text, text) to authenticated, service_role;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated, service_role;

commit;
