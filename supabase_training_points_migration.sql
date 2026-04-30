begin;

create table if not exists public.training_session_settings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  registration_start_at timestamptz,
  registration_end_at timestamptz,
  manual_status text not null default 'draft',
  capacity integer,
  point_cost integer not null default 1,
  published_at timestamptz,
  finalized_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_session_settings_match_id_key unique (match_id),
  constraint training_session_settings_manual_status_check check (
    manual_status in ('draft', 'open', 'paused', 'closed', 'finalized')
  ),
  constraint training_session_settings_capacity_check check (capacity is null or capacity > 0),
  constraint training_session_settings_point_cost_check check (point_cost >= 0),
  constraint training_session_settings_registration_range_check check (
    registration_start_at is null
    or registration_end_at is null
    or registration_end_at >= registration_start_at
  )
);

create table if not exists public.training_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_session_settings(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  status text not null default 'applied',
  point_status text not null default 'none',
  note text,
  applied_by uuid references public.profiles(id) on delete set null,
  selected_by uuid references public.profiles(id) on delete set null,
  selected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_registrations_session_member_key unique (session_id, member_id),
  constraint training_registrations_status_check check (
    status in ('applied', 'selected', 'waitlisted', 'rejected', 'cancelled')
  ),
  constraint training_registrations_point_status_check check (
    point_status in ('none', 'reserved', 'spent', 'released')
  )
);

create table if not exists public.player_point_transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  delta integer not null,
  reason text,
  source text not null default 'manual',
  related_session_id uuid references public.training_session_settings(id) on delete set null,
  related_registration_id uuid references public.training_registrations(id) on delete set null,
  idempotency_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint player_point_transactions_delta_check check (delta <> 0),
  constraint player_point_transactions_source_check check (
    source in ('manual', 'system_spend', 'adjustment')
  ),
  constraint player_point_transactions_idempotency_key_key unique (idempotency_key)
);

create table if not exists public.training_no_show_blocks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  source_session_id uuid not null references public.training_session_settings(id) on delete cascade,
  blocked_session_id uuid references public.training_session_settings(id) on delete set null,
  status text not null default 'active',
  reason text,
  waived_by uuid references public.profiles(id) on delete set null,
  waived_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint training_no_show_blocks_status_check check (status in ('active', 'served', 'waived'))
);

alter table public.attendance_events
  add column if not exists training_session_id uuid references public.training_session_settings(id) on delete set null;

create unique index if not exists attendance_events_training_session_id_uidx
  on public.attendance_events (training_session_id)
  where training_session_id is not null;

create index if not exists training_session_settings_match_idx
  on public.training_session_settings (match_id);

create index if not exists training_session_settings_registration_window_idx
  on public.training_session_settings (manual_status, registration_start_at, registration_end_at);

create index if not exists training_registrations_session_status_idx
  on public.training_registrations (session_id, status);

create index if not exists training_registrations_member_status_idx
  on public.training_registrations (member_id, status);

create index if not exists player_point_transactions_member_created_idx
  on public.player_point_transactions (member_id, created_at desc);

create index if not exists training_no_show_blocks_member_status_idx
  on public.training_no_show_blocks (member_id, status);

create unique index if not exists training_no_show_blocks_active_source_uidx
  on public.training_no_show_blocks (member_id, source_session_id)
  where status = 'active';

alter table public.training_session_settings enable row level security;
alter table public.training_registrations enable row level security;
alter table public.player_point_transactions enable row level security;
alter table public.training_no_show_blocks enable row level security;

drop policy if exists "team_members_select_permitted_features" on public.team_members;
create policy "team_members_select_permitted_features"
  on public.team_members
  for select
  using (
    public.has_any_app_permission(
      array['players', 'leave_requests', 'attendance', 'fees', 'users', 'matches', 'equipment', 'training'],
      'VIEW'
    )
  );

insert into public.app_role_permissions (role_key, feature, action)
select distinct role_key, 'training', action
from public.app_role_permissions
where feature in ('matches', 'attendance')
  and action in ('VIEW', 'CREATE', 'EDIT', 'DELETE')
on conflict (role_key, feature, action) do nothing;

create or replace function public.is_profile_linked_to_member(p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p_member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
  );
$$;

create or replace function public.is_training_registration_window_open(
  p_manual_status text,
  p_registration_start_at timestamptz,
  p_registration_end_at timestamptz
)
returns boolean
language sql
stable
as $$
  select coalesce(p_manual_status, 'draft') = 'open'
    and (p_registration_start_at is null or now() >= p_registration_start_at)
    and (p_registration_end_at is null or now() <= p_registration_end_at);
$$;

create or replace function public.get_player_point_balance(p_member_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(delta), 0)::integer
  from public.player_point_transactions
  where member_id = p_member_id;
$$;

create or replace function public.get_player_reserved_training_points(
  p_member_id uuid,
  p_exclude_registration_id uuid default null
)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(tss.point_cost), 0)::integer
  from public.training_registrations tr
  join public.training_session_settings tss
    on tss.id = tr.session_id
  where tr.member_id = p_member_id
    and tr.status = 'selected'
    and tr.point_status = 'reserved'
    and (p_exclude_registration_id is null or tr.id <> p_exclude_registration_id);
$$;

create or replace function public.get_player_available_training_points(
  p_member_id uuid,
  p_exclude_registration_id uuid default null
)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select public.get_player_point_balance(p_member_id)
    - public.get_player_reserved_training_points(p_member_id, p_exclude_registration_id);
$$;

create or replace function public.get_next_training_session_id(p_source_session_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  with source_session as (
    select
      tss.id,
      m.match_date,
      coalesce(m.match_time, '') as match_time
    from public.training_session_settings tss
    join public.matches m
      on m.id = tss.match_id
    where tss.id = p_source_session_id
  )
  select next_session.id
  from source_session src
  join public.training_session_settings next_session
    on next_session.id <> src.id
  join public.matches next_match
    on next_match.id = next_session.match_id
  where next_match.match_level = '特訓課'
    and (
      next_match.match_date > src.match_date
      or (
        next_match.match_date = src.match_date
        and coalesce(next_match.match_time, '') > src.match_time
      )
    )
  order by next_match.match_date asc, coalesce(next_match.match_time, '') asc
  limit 1;
$$;

drop policy if exists "training_sessions_select_authenticated" on public.training_session_settings;
create policy "training_sessions_select_authenticated"
  on public.training_session_settings
  for select
  using (auth.uid() is not null);

drop policy if exists "training_sessions_insert_create" on public.training_session_settings;
create policy "training_sessions_insert_create"
  on public.training_session_settings
  for insert
  with check (public.has_app_permission('training', 'CREATE'));

drop policy if exists "training_sessions_update_edit" on public.training_session_settings;
create policy "training_sessions_update_edit"
  on public.training_session_settings
  for update
  using (public.has_app_permission('training', 'EDIT'))
  with check (public.has_app_permission('training', 'EDIT'));

drop policy if exists "training_sessions_delete_delete" on public.training_session_settings;
create policy "training_sessions_delete_delete"
  on public.training_session_settings
  for delete
  using (public.has_app_permission('training', 'DELETE'));

drop policy if exists "training_registrations_select_allowed" on public.training_registrations;
create policy "training_registrations_select_allowed"
  on public.training_registrations
  for select
  using (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE')
    or public.is_profile_linked_to_member(member_id)
  );

drop policy if exists "training_registrations_insert_rpc_only" on public.training_registrations;
create policy "training_registrations_insert_rpc_only"
  on public.training_registrations
  for insert
  with check (false);

drop policy if exists "training_registrations_update_rpc_or_training_edit" on public.training_registrations;
create policy "training_registrations_update_rpc_or_training_edit"
  on public.training_registrations
  for update
  using (public.has_app_permission('training', 'EDIT'))
  with check (public.has_app_permission('training', 'EDIT'));

drop policy if exists "training_registrations_delete_delete" on public.training_registrations;
create policy "training_registrations_delete_delete"
  on public.training_registrations
  for delete
  using (public.has_app_permission('training', 'DELETE'));

drop policy if exists "player_point_transactions_select_allowed" on public.player_point_transactions;
create policy "player_point_transactions_select_allowed"
  on public.player_point_transactions
  for select
  using (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE')
    or public.is_profile_linked_to_member(member_id)
  );

drop policy if exists "player_point_transactions_insert_training_edit" on public.player_point_transactions;
create policy "player_point_transactions_insert_training_edit"
  on public.player_point_transactions
  for insert
  with check (public.has_app_permission('training', 'EDIT'));

drop policy if exists "training_no_show_blocks_select_allowed" on public.training_no_show_blocks;
create policy "training_no_show_blocks_select_allowed"
  on public.training_no_show_blocks
  for select
  using (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE')
    or public.is_profile_linked_to_member(member_id)
  );

drop policy if exists "training_no_show_blocks_insert_training_edit" on public.training_no_show_blocks;
create policy "training_no_show_blocks_insert_training_edit"
  on public.training_no_show_blocks
  for insert
  with check (public.has_app_permission('training', 'EDIT'));

drop policy if exists "training_no_show_blocks_update_training_edit" on public.training_no_show_blocks;
create policy "training_no_show_blocks_update_training_edit"
  on public.training_no_show_blocks
  for update
  using (public.has_app_permission('training', 'EDIT'))
  with check (public.has_app_permission('training', 'EDIT'));

drop policy if exists "attendance_events_training_select" on public.attendance_events;
create policy "attendance_events_training_select"
  on public.attendance_events
  for select
  using (
    training_session_id is not null
    and (
      public.has_app_permission('training', 'VIEW')
      or public.has_app_permission('training', 'CREATE')
      or public.has_app_permission('training', 'EDIT')
      or public.has_app_permission('training', 'DELETE')
    )
  );

drop policy if exists "attendance_events_training_insert" on public.attendance_events;
create policy "attendance_events_training_insert"
  on public.attendance_events
  for insert
  with check (
    training_session_id is not null
    and public.has_app_permission('training', 'CREATE')
  );

drop policy if exists "attendance_events_training_update" on public.attendance_events;
create policy "attendance_events_training_update"
  on public.attendance_events
  for update
  using (
    training_session_id is not null
    and public.has_app_permission('training', 'EDIT')
  )
  with check (
    training_session_id is not null
    and public.has_app_permission('training', 'EDIT')
  );

drop policy if exists "attendance_events_training_delete" on public.attendance_events;
create policy "attendance_events_training_delete"
  on public.attendance_events
  for delete
  using (
    training_session_id is not null
    and public.has_app_permission('training', 'DELETE')
  );

drop policy if exists "attendance_records_training_select" on public.attendance_records;
create policy "attendance_records_training_select"
  on public.attendance_records
  for select
  using (
    exists (
      select 1
      from public.attendance_events ae
      where ae.id = attendance_records.event_id
        and ae.training_session_id is not null
    )
    and (
      public.has_app_permission('training', 'CREATE')
      or public.has_app_permission('training', 'EDIT')
      or public.has_app_permission('training', 'DELETE')
      or public.is_profile_linked_to_member(member_id)
    )
  );

drop policy if exists "attendance_records_training_insert" on public.attendance_records;
create policy "attendance_records_training_insert"
  on public.attendance_records
  for insert
  with check (
    exists (
      select 1
      from public.attendance_events ae
      where ae.id = attendance_records.event_id
        and ae.training_session_id is not null
    )
    and public.has_app_permission('training', 'EDIT')
  );

drop policy if exists "attendance_records_training_update" on public.attendance_records;
create policy "attendance_records_training_update"
  on public.attendance_records
  for update
  using (
    exists (
      select 1
      from public.attendance_events ae
      where ae.id = attendance_records.event_id
        and ae.training_session_id is not null
    )
    and public.has_app_permission('training', 'EDIT')
  )
  with check (
    exists (
      select 1
      from public.attendance_events ae
      where ae.id = attendance_records.event_id
        and ae.training_session_id is not null
    )
    and public.has_app_permission('training', 'EDIT')
  );

drop policy if exists "attendance_records_training_delete" on public.attendance_records;
create policy "attendance_records_training_delete"
  on public.attendance_records
  for delete
  using (
    exists (
      select 1
      from public.attendance_events ae
      where ae.id = attendance_records.event_id
        and ae.training_session_id is not null
    )
    and public.has_app_permission('training', 'DELETE')
  );

create or replace function public.list_my_training_members()
returns table (
  member_id uuid,
  name text,
  role text,
  team_group text,
  point_balance integer,
  reserved_points integer,
  available_points integer,
  active_block_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    tm.id,
    tm.name::text,
    tm.role::text,
    tm.team_group::text,
    public.get_player_point_balance(tm.id),
    public.get_player_reserved_training_points(tm.id),
    public.get_player_available_training_points(tm.id),
    (
      select count(*)::integer
      from public.training_no_show_blocks b
      where b.member_id = tm.id
        and b.status = 'active'
    ) as active_block_count
  from public.profiles p
  join public.team_members tm
    on tm.id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
  where p.id = v_user_id
  order by
    case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
    tm.name asc;
end;
$$;

create or replace function public.list_training_sessions(p_member_id uuid default null)
returns table (
  session_id uuid,
  match_id uuid,
  match_name text,
  match_date date,
  match_time text,
  location text,
  category_group text,
  manual_status text,
  registration_start_at timestamptz,
  registration_end_at timestamptz,
  capacity integer,
  point_cost integer,
  published_at timestamptz,
  selected_count integer,
  applied_count integer,
  is_registration_open boolean,
  registration_id uuid,
  registration_status text,
  point_status text,
  is_blocked boolean,
  block_reason text,
  selected_members jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_manage boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_can_manage := public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE');

  if p_member_id is not null
    and not v_can_manage
    and not public.is_profile_linked_to_member(p_member_id)
  then
    raise exception 'member not linked to current profile';
  end if;

  return query
  select
    tss.id as session_id,
    m.id as match_id,
    m.match_name::text,
    m.match_date,
    m.match_time::text,
    m.location::text,
    m.category_group::text,
    coalesce(tss.manual_status, 'draft')::text as manual_status,
    tss.registration_start_at,
    tss.registration_end_at,
    tss.capacity,
    coalesce(tss.point_cost, 1) as point_cost,
    tss.published_at,
    coalesce(reg_counts.selected_count, 0) as selected_count,
    coalesce(reg_counts.applied_count, 0) as applied_count,
    (
      tss.id is not null
      and public.is_training_registration_window_open(
        tss.manual_status,
        tss.registration_start_at,
        tss.registration_end_at
      )
    ) as is_registration_open,
    my_reg.id as registration_id,
    my_reg.status::text as registration_status,
    my_reg.point_status::text as point_status,
    coalesce(block_state.is_blocked, false) as is_blocked,
    block_state.reason as block_reason,
    case
      when tss.id is not null
        and (
          v_can_manage
          or (tss.published_at is not null and tss.published_at <= now())
        )
      then coalesce(selected_roster.members, '[]'::jsonb)
      else '[]'::jsonb
    end as selected_members
  from public.matches m
  left join public.training_session_settings tss
    on tss.match_id = m.id
  left join lateral (
    select
      count(*) filter (where tr.status = 'selected')::integer as selected_count,
      count(*) filter (where tr.status in ('applied', 'selected', 'waitlisted'))::integer as applied_count
    from public.training_registrations tr
    where tr.session_id = tss.id
  ) reg_counts on true
  left join public.training_registrations my_reg
    on my_reg.session_id = tss.id
   and my_reg.member_id = p_member_id
  left join lateral (
    select
      true as is_blocked,
      coalesce(nullif(b.reason, ''), '上次特訓未到，下一場暫停報名')::text as reason
    from public.training_no_show_blocks b
    where b.member_id = p_member_id
      and b.status = 'active'
      and (
        b.blocked_session_id = tss.id
        or (
          b.blocked_session_id is null
          and public.get_next_training_session_id(b.source_session_id) = tss.id
        )
      )
    order by b.created_at desc
    limit 1
  ) block_state on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'member_id', tm.id,
        'name', tm.name,
        'role', tm.role,
        'team_group', tm.team_group,
        'jersey_number', tm.jersey_number
      )
      order by tm.role, tm.name
    ) as members
    from public.training_registrations selected_reg
    join public.team_members tm
      on tm.id = selected_reg.member_id
    where selected_reg.session_id = tss.id
      and selected_reg.status = 'selected'
  ) selected_roster on true
  where m.match_level = '特訓課'
    and (v_can_manage or tss.id is not null)
  order by m.match_date asc, coalesce(m.match_time, '') asc, m.match_name asc;
end;
$$;

create or replace function public.create_training_registration(
  p_session_id uuid,
  p_member_id uuid,
  p_note text default null
)
returns public.training_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_settings public.training_session_settings%rowtype;
  v_existing public.training_registrations%rowtype;
  v_registration public.training_registrations%rowtype;
  v_available_points integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_profile_linked_to_member(p_member_id) then
    raise exception 'member not linked to current profile';
  end if;

  select tss.*
  into v_settings
  from public.training_session_settings tss
  join public.matches m
    on m.id = tss.match_id
  where tss.id = p_session_id
    and m.match_level = '特訓課';

  if v_settings.id is null then
    raise exception 'training session not found';
  end if;

  if not public.is_training_registration_window_open(
    v_settings.manual_status,
    v_settings.registration_start_at,
    v_settings.registration_end_at
  ) then
    raise exception 'training registration is not open';
  end if;

  if exists (
    select 1
    from public.training_no_show_blocks b
    where b.member_id = p_member_id
      and b.status = 'active'
      and (
        b.blocked_session_id = p_session_id
        or (
          b.blocked_session_id is null
          and public.get_next_training_session_id(b.source_session_id) = p_session_id
        )
      )
  ) then
    raise exception 'member is blocked from this training session';
  end if;

  v_available_points := public.get_player_available_training_points(p_member_id);

  if v_available_points < v_settings.point_cost then
    raise exception 'not enough training points';
  end if;

  select *
  into v_existing
  from public.training_registrations
  where session_id = p_session_id
    and member_id = p_member_id;

  if v_existing.id is not null then
    if v_existing.status in ('applied', 'selected', 'waitlisted') then
      raise exception 'member already registered for this training session';
    end if;

    if v_existing.point_status = 'spent' then
      raise exception 'training points were already spent for this registration';
    end if;

    update public.training_registrations
    set
      status = 'applied',
      point_status = 'none',
      note = nullif(btrim(p_note), ''),
      applied_by = v_user_id,
      selected_by = null,
      selected_at = null,
      cancelled_at = null,
      updated_at = timezone('utc', now())
    where id = v_existing.id
    returning *
    into v_registration;
  else
    insert into public.training_registrations (
      session_id,
      member_id,
      status,
      point_status,
      note,
      applied_by
    )
    values (
      p_session_id,
      p_member_id,
      'applied',
      'none',
      nullif(btrim(p_note), ''),
      v_user_id
    )
    returning *
    into v_registration;
  end if;

  return v_registration;
end;
$$;

create or replace function public.cancel_training_registration(p_registration_id uuid)
returns public.training_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_registration public.training_registrations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_registration
  from public.training_registrations
  where id = p_registration_id;

  if v_registration.id is null then
    raise exception 'training registration not found';
  end if;

  if not public.is_profile_linked_to_member(v_registration.member_id)
    and not public.has_app_permission('training', 'EDIT')
  then
    raise exception 'training registration is not cancellable by current profile';
  end if;

  if v_registration.point_status = 'spent' then
    raise exception 'spent training points cannot be cancelled';
  end if;

  update public.training_registrations
  set
    status = 'cancelled',
    point_status = case when point_status = 'reserved' then 'released' else point_status end,
    cancelled_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = p_registration_id
  returning *
  into v_registration;

  return v_registration;
end;
$$;

create or replace function public.upsert_training_session_settings(
  p_match_id uuid,
  p_registration_start_at timestamptz default null,
  p_registration_end_at timestamptz default null,
  p_manual_status text default 'draft',
  p_capacity integer default null,
  p_point_cost integer default 1
)
returns public.training_session_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.training_session_settings%rowtype;
  v_settings public.training_session_settings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_existing
  from public.training_session_settings
  where match_id = p_match_id;

  if v_existing.id is null then
    if not public.has_app_permission('training', 'CREATE') then
      raise exception 'training:CREATE permission required';
    end if;
  elsif not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  if not exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.match_level = '特訓課'
  ) then
    raise exception 'match must be a 特訓課';
  end if;

  if p_manual_status not in ('draft', 'open', 'paused', 'closed', 'finalized') then
    raise exception 'invalid training manual status';
  end if;

  if p_capacity is not null and p_capacity <= 0 then
    raise exception 'capacity must be greater than 0';
  end if;

  if coalesce(p_point_cost, 1) < 0 then
    raise exception 'point_cost must not be negative';
  end if;

  if p_registration_start_at is not null
    and p_registration_end_at is not null
    and p_registration_end_at < p_registration_start_at
  then
    raise exception 'registration_end_at must be on or after registration_start_at';
  end if;

  insert into public.training_session_settings (
    match_id,
    registration_start_at,
    registration_end_at,
    manual_status,
    capacity,
    point_cost,
    created_by
  )
  values (
    p_match_id,
    p_registration_start_at,
    p_registration_end_at,
    p_manual_status,
    p_capacity,
    coalesce(p_point_cost, 1),
    v_user_id
  )
  on conflict (match_id) do update
  set
    registration_start_at = excluded.registration_start_at,
    registration_end_at = excluded.registration_end_at,
    manual_status = excluded.manual_status,
    capacity = excluded.capacity,
    point_cost = excluded.point_cost,
    finalized_at = case
      when excluded.manual_status = 'finalized' then coalesce(public.training_session_settings.finalized_at, timezone('utc', now()))
      else public.training_session_settings.finalized_at
    end,
    updated_at = timezone('utc', now())
  returning *
  into v_settings;

  return v_settings;
end;
$$;

create or replace function public.create_training_match_with_settings(
  p_match_name text,
  p_match_date date,
  p_match_time text default null,
  p_location text default null,
  p_category_group text default null,
  p_registration_start_at timestamptz default null,
  p_registration_end_at timestamptz default null,
  p_manual_status text default 'draft',
  p_capacity integer default null,
  p_point_cost integer default 1
)
returns public.training_session_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_match_id uuid;
  v_settings public.training_session_settings%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'CREATE') then
    raise exception 'training:CREATE permission required';
  end if;

  if nullif(btrim(p_match_name), '') is null then
    raise exception 'match_name is required';
  end if;

  if p_match_date is null then
    raise exception 'match_date is required';
  end if;

  if p_manual_status not in ('draft', 'open', 'paused', 'closed', 'finalized') then
    raise exception 'invalid training manual status';
  end if;

  if p_capacity is not null and p_capacity <= 0 then
    raise exception 'capacity must be greater than 0';
  end if;

  if coalesce(p_point_cost, 1) < 0 then
    raise exception 'point_cost must not be negative';
  end if;

  if p_registration_start_at is not null
    and p_registration_end_at is not null
    and p_registration_end_at < p_registration_start_at
  then
    raise exception 'registration_end_at must be on or after registration_start_at';
  end if;

  insert into public.matches (
    match_name,
    opponent,
    match_date,
    match_time,
    location,
    category_group,
    match_level,
    home_score,
    opponent_score,
    coaches,
    players,
    note,
    photo_url,
    absent_players,
    lineup,
    current_lineup,
    inning_logs,
    batting_stats,
    pitching_stats,
    current_batter_name,
    current_inning,
    current_b,
    current_s,
    current_o,
    base_1,
    base_2,
    base_3,
    bat_first,
    show_lineup_intro,
    show_line_score,
    show_3d_field,
    line_score_data
  )
  values (
    nullif(btrim(p_match_name), ''),
    '特訓課',
    p_match_date,
    coalesce(nullif(btrim(p_match_time), ''), ''),
    nullif(btrim(p_location), ''),
    nullif(btrim(p_category_group), ''),
    '特訓課',
    0,
    0,
    '',
    '',
    '',
    '',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '',
    '一上',
    0,
    0,
    0,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    '{}'::jsonb
  )
  returning id
  into v_match_id;

  insert into public.training_session_settings (
    match_id,
    registration_start_at,
    registration_end_at,
    manual_status,
    capacity,
    point_cost,
    created_by
  )
  values (
    v_match_id,
    p_registration_start_at,
    p_registration_end_at,
    p_manual_status,
    p_capacity,
    coalesce(p_point_cost, 1),
    v_user_id
  )
  returning *
  into v_settings;

  return v_settings;
end;
$$;

create or replace function public.list_training_admin_registrations(p_session_id uuid)
returns table (
  registration_id uuid,
  session_id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  team_group text,
  jersey_number text,
  status text,
  point_status text,
  note text,
  applied_by uuid,
  applied_by_name text,
  selected_by uuid,
  selected_at timestamptz,
  created_at timestamptz,
  point_balance integer,
  reserved_points integer,
  available_points integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE')
  ) then
    raise exception 'training management permission required';
  end if;

  return query
  select
    tr.id,
    tr.session_id,
    tr.member_id,
    tm.name::text,
    tm.role::text,
    tm.team_group::text,
    tm.jersey_number::text,
    tr.status::text,
    tr.point_status::text,
    tr.note::text,
    tr.applied_by,
    coalesce(p.nickname, p.name)::text as applied_by_name,
    tr.selected_by,
    tr.selected_at,
    tr.created_at,
    public.get_player_point_balance(tr.member_id),
    public.get_player_reserved_training_points(tr.member_id),
    public.get_player_available_training_points(tr.member_id)
  from public.training_registrations tr
  join public.team_members tm
    on tm.id = tr.member_id
  left join public.profiles p
    on p.id = tr.applied_by
  where tr.session_id = p_session_id
  order by
    case tr.status
      when 'selected' then 0
      when 'applied' then 1
      when 'waitlisted' then 2
      when 'rejected' then 3
      else 4
    end,
    tr.created_at asc;
end;
$$;

create or replace function public.review_training_registration(
  p_registration_id uuid,
  p_status text,
  p_note text default null
)
returns public.training_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_registration public.training_registrations%rowtype;
  v_settings public.training_session_settings%rowtype;
  v_available_points integer;
  v_selected_count integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  if p_status not in ('applied', 'selected', 'waitlisted', 'rejected', 'cancelled') then
    raise exception 'invalid registration status';
  end if;

  select *
  into v_registration
  from public.training_registrations
  where id = p_registration_id;

  if v_registration.id is null then
    raise exception 'training registration not found';
  end if;

  if v_registration.point_status = 'spent' and p_status <> 'selected' then
    raise exception 'spent training registration cannot be changed away from selected';
  end if;

  select *
  into v_settings
  from public.training_session_settings
  where id = v_registration.session_id;

  if p_status = 'selected' then
    if v_settings.capacity is not null then
      select count(*)::integer
      into v_selected_count
      from public.training_registrations
      where session_id = v_registration.session_id
        and status = 'selected'
        and id <> p_registration_id;

      if v_selected_count >= v_settings.capacity then
        raise exception 'training capacity is full';
      end if;
    end if;

    v_available_points := public.get_player_available_training_points(
      v_registration.member_id,
      p_registration_id
    );

    if v_available_points < v_settings.point_cost then
      raise exception 'not enough available training points to select this member';
    end if;
  end if;

  update public.training_registrations
  set
    status = p_status,
    point_status = case
      when p_status = 'selected' and point_status <> 'spent' then 'reserved'
      when p_status in ('rejected', 'cancelled') and point_status = 'reserved' then 'released'
      when p_status in ('applied', 'waitlisted') and point_status = 'reserved' then 'released'
      else point_status
    end,
    note = coalesce(nullif(btrim(p_note), ''), note),
    selected_by = case when p_status = 'selected' then v_user_id else selected_by end,
    selected_at = case when p_status = 'selected' then timezone('utc', now()) else selected_at end,
    cancelled_at = case when p_status = 'cancelled' then timezone('utc', now()) else cancelled_at end,
    updated_at = timezone('utc', now())
  where id = p_registration_id
  returning *
  into v_registration;

  return v_registration;
end;
$$;

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

create or replace function public.grant_player_points(
  p_member_ids uuid[],
  p_delta integer,
  p_reason text default null
)
returns setof public.player_point_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
  ) then
    raise exception 'training CREATE or EDIT permission required';
  end if;

  if p_member_ids is null or cardinality(p_member_ids) = 0 then
    raise exception 'member_ids are required';
  end if;

  if coalesce(p_delta, 0) = 0 then
    raise exception 'delta must not be 0';
  end if;

  if p_delta < 0 and exists (
    select 1
    from unnest(p_member_ids) as member_id
    where public.get_player_point_balance(member_id) + p_delta
      < public.get_player_reserved_training_points(member_id)
  ) then
    raise exception 'point adjustment would make available points negative';
  end if;

  return query
  insert into public.player_point_transactions (
    member_id,
    delta,
    reason,
    source,
    created_by
  )
  select
    distinct member_id,
    p_delta,
    nullif(btrim(p_reason), ''),
    'manual',
    v_user_id
  from unnest(p_member_ids) as member_id
  returning *;
end;
$$;

create or replace function public.list_player_point_transactions(p_member_id uuid default null)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  delta integer,
  reason text,
  source text,
  related_session_id uuid,
  related_registration_id uuid,
  created_by uuid,
  created_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_can_manage boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_can_manage := public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE');

  if p_member_id is not null
    and not v_can_manage
    and not public.is_profile_linked_to_member(p_member_id)
  then
    raise exception 'member not linked to current profile';
  end if;

  return query
  select
    ppt.id,
    ppt.member_id,
    tm.name::text as member_name,
    ppt.delta,
    ppt.reason::text,
    ppt.source::text,
    ppt.related_session_id,
    ppt.related_registration_id,
    ppt.created_by,
    coalesce(p.nickname, p.name)::text as created_by_name,
    ppt.created_at
  from public.player_point_transactions ppt
  join public.team_members tm
    on tm.id = ppt.member_id
  left join public.profiles p
    on p.id = ppt.created_by
  where (
    p_member_id is not null and ppt.member_id = p_member_id
  ) or (
    p_member_id is null
    and (
      v_can_manage
      or public.is_profile_linked_to_member(ppt.member_id)
    )
  )
  order by ppt.created_at desc
  limit 200;
end;
$$;

create or replace function public.create_training_attendance_event(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_match public.matches%rowtype;
  v_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  select m.*
  into v_match
  from public.training_session_settings tss
  join public.matches m
    on m.id = tss.match_id
  where tss.id = p_session_id
    and m.match_level = '特訓課';

  if v_match.id is null then
    raise exception 'training session not found';
  end if;

  select id
  into v_event_id
  from public.attendance_events
  where training_session_id = p_session_id
  limit 1;

  if v_event_id is null then
    insert into public.attendance_events (
      title,
      date,
      event_type,
      created_by,
      training_session_id
    )
    values (
      coalesce(nullif(v_match.match_name, ''), '特訓課點名'),
      v_match.match_date,
      '特訓課',
      v_user_id,
      p_session_id
    )
    returning id
    into v_event_id;
  end if;

  insert into public.attendance_records (
    event_id,
    member_id,
    status
  )
  select
    v_event_id,
    tr.member_id,
    '待點名'
  from public.training_registrations tr
  where tr.session_id = p_session_id
    and tr.status = 'selected'
  on conflict (event_id, member_id) do nothing;

  return v_event_id;
end;
$$;

create or replace function public.apply_training_attendance_result(
  p_event_id uuid,
  p_member_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_next_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('attendance', 'EDIT')
    or public.has_app_permission('training', 'EDIT')
  ) then
    raise exception 'attendance:EDIT or training:EDIT permission required';
  end if;

  select training_session_id
  into v_session_id
  from public.attendance_events
  where id = p_event_id;

  if v_session_id is null then
    return;
  end if;

  if p_status = '缺席' then
    v_next_session_id := public.get_next_training_session_id(v_session_id);

    insert into public.training_no_show_blocks (
      member_id,
      source_session_id,
      blocked_session_id,
      status,
      reason
    )
    values (
      p_member_id,
      v_session_id,
      v_next_session_id,
      'active',
      '特訓課未到，下一場暫停報名'
    )
    on conflict (member_id, source_session_id) where status = 'active'
    do update set
      blocked_session_id = excluded.blocked_session_id,
      reason = excluded.reason,
      updated_at = timezone('utc', now());
  elsif p_status in ('出席', '請假') then
    update public.training_no_show_blocks
    set
      status = 'waived',
      waived_by = v_user_id,
      waived_at = timezone('utc', now()),
      resolved_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where member_id = p_member_id
      and source_session_id = v_session_id
      and status = 'active';
  end if;
end;
$$;

create or replace function public.process_training_session_automation(p_today date default null)
returns table (
  spent_count integer,
  skipped_count integer,
  released_block_count integer,
  finalized_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Taipei')::date);
  v_row record;
  v_spent_count integer := 0;
  v_skipped_count integer := 0;
  v_released_block_count integer := 0;
  v_finalized_count integer := 0;
  v_idempotency_key text;
  v_row_count integer := 0;
begin
  if auth.uid() is not null
    and not public.has_app_permission('training', 'EDIT')
  then
    raise exception 'training:EDIT permission required';
  end if;

  for v_row in
    select
      tr.id as registration_id,
      tr.member_id,
      tr.session_id,
      tss.point_cost,
      m.match_date
    from public.training_registrations tr
    join public.training_session_settings tss
      on tss.id = tr.session_id
    join public.matches m
      on m.id = tss.match_id
    where tr.status = 'selected'
      and tr.point_status = 'reserved'
      and m.match_date <= v_today
  loop
    v_idempotency_key := 'training_spend:' || v_row.registration_id::text;

    if v_row.point_cost = 0 then
      update public.training_registrations
      set
        point_status = 'spent',
        updated_at = timezone('utc', now())
      where id = v_row.registration_id;

      v_spent_count := v_spent_count + 1;
    elsif exists (
      select 1
      from public.player_point_transactions ppt
      where ppt.idempotency_key = v_idempotency_key
    ) then
      update public.training_registrations
      set
        point_status = 'spent',
        updated_at = timezone('utc', now())
      where id = v_row.registration_id;

      v_spent_count := v_spent_count + 1;
    elsif public.get_player_point_balance(v_row.member_id) >= v_row.point_cost then
      insert into public.player_point_transactions (
        member_id,
        delta,
        reason,
        source,
        related_session_id,
        related_registration_id,
        idempotency_key
      )
      values (
        v_row.member_id,
        -1 * v_row.point_cost,
        '特訓課錄取扣點',
        'system_spend',
        v_row.session_id,
        v_row.registration_id,
        v_idempotency_key
      )
      on conflict (idempotency_key) do nothing;

      update public.training_registrations
      set
        point_status = 'spent',
        updated_at = timezone('utc', now())
      where id = v_row.registration_id;

      v_spent_count := v_spent_count + 1;
    else
      v_skipped_count := v_skipped_count + 1;
    end if;
  end loop;

  update public.training_no_show_blocks b
  set
    status = 'served',
    resolved_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.training_session_settings blocked_session
  join public.matches blocked_match
    on blocked_match.id = blocked_session.match_id
  where b.status = 'active'
    and b.blocked_session_id = blocked_session.id
    and blocked_match.match_date < v_today;

  get diagnostics v_released_block_count = row_count;

  update public.training_no_show_blocks b
  set
    status = 'served',
    resolved_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  from public.training_session_settings blocked_session
  join public.matches blocked_match
    on blocked_match.id = blocked_session.match_id
  where b.status = 'active'
    and b.blocked_session_id is null
    and public.get_next_training_session_id(b.source_session_id) = blocked_session.id
    and blocked_match.match_date < v_today;

  get diagnostics v_row_count = row_count;
  v_released_block_count := v_released_block_count + v_row_count;

  update public.training_session_settings tss
  set
    manual_status = 'finalized',
    finalized_at = coalesce(tss.finalized_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  from public.matches m
  where m.id = tss.match_id
    and m.match_level = '特訓課'
    and m.match_date < v_today
    and tss.manual_status <> 'finalized';

  get diagnostics v_finalized_count = row_count;

  spent_count := v_spent_count;
  skipped_count := v_skipped_count;
  released_block_count := v_released_block_count;
  finalized_count := v_finalized_count;
  return next;
end;
$$;

revoke all on function public.is_profile_linked_to_member(uuid) from public;
grant execute on function public.is_profile_linked_to_member(uuid) to authenticated, service_role;

revoke all on function public.is_training_registration_window_open(text, timestamptz, timestamptz) from public;
grant execute on function public.is_training_registration_window_open(text, timestamptz, timestamptz) to authenticated, service_role;

revoke all on function public.get_player_point_balance(uuid) from public;
grant execute on function public.get_player_point_balance(uuid) to authenticated, service_role;

revoke all on function public.get_player_reserved_training_points(uuid, uuid) from public;
grant execute on function public.get_player_reserved_training_points(uuid, uuid) to authenticated, service_role;

revoke all on function public.get_player_available_training_points(uuid, uuid) from public;
grant execute on function public.get_player_available_training_points(uuid, uuid) to authenticated, service_role;

revoke all on function public.get_next_training_session_id(uuid) from public;
grant execute on function public.get_next_training_session_id(uuid) to authenticated, service_role;

revoke all on function public.list_my_training_members() from public;
grant execute on function public.list_my_training_members() to authenticated;

revoke all on function public.list_training_sessions(uuid) from public;
grant execute on function public.list_training_sessions(uuid) to authenticated, service_role;

revoke all on function public.create_training_registration(uuid, uuid, text) from public;
grant execute on function public.create_training_registration(uuid, uuid, text) to authenticated;

revoke all on function public.cancel_training_registration(uuid) from public;
grant execute on function public.cancel_training_registration(uuid) to authenticated;

revoke all on function public.upsert_training_session_settings(uuid, timestamptz, timestamptz, text, integer, integer) from public;
grant execute on function public.upsert_training_session_settings(uuid, timestamptz, timestamptz, text, integer, integer) to authenticated, service_role;

revoke all on function public.create_training_match_with_settings(text, date, text, text, text, timestamptz, timestamptz, text, integer, integer) from public;
grant execute on function public.create_training_match_with_settings(text, date, text, text, text, timestamptz, timestamptz, text, integer, integer) to authenticated, service_role;

revoke all on function public.list_training_admin_registrations(uuid) from public;
grant execute on function public.list_training_admin_registrations(uuid) to authenticated, service_role;

revoke all on function public.review_training_registration(uuid, text, text) from public;
grant execute on function public.review_training_registration(uuid, text, text) to authenticated, service_role;

revoke all on function public.publish_training_selection(uuid) from public;
grant execute on function public.publish_training_selection(uuid) to authenticated, service_role;

revoke all on function public.grant_player_points(uuid[], integer, text) from public;
grant execute on function public.grant_player_points(uuid[], integer, text) to authenticated, service_role;

revoke all on function public.list_player_point_transactions(uuid) from public;
grant execute on function public.list_player_point_transactions(uuid) to authenticated, service_role;

revoke all on function public.create_training_attendance_event(uuid) from public;
grant execute on function public.create_training_attendance_event(uuid) to authenticated, service_role;

revoke all on function public.apply_training_attendance_result(uuid, uuid, text) from public;
grant execute on function public.apply_training_attendance_result(uuid, uuid, text) to authenticated, service_role;

revoke all on function public.process_training_session_automation(date) from public;
grant execute on function public.process_training_session_automation(date) to authenticated, service_role;

create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'training-session-automation-hourly';

select cron.schedule(
  'training-session-automation-hourly',
  '15 * * * *',
  $$
  select public.process_training_session_automation();
  $$
);

notify pgrst, 'reload schema';

commit;
