begin;

alter table public.leave_requests
  add column if not exists leave_time_segment text not null default 'full_day';

update public.leave_requests
set leave_time_segment = 'full_day'
where leave_time_segment is null
   or btrim(leave_time_segment) = ''
   or leave_time_segment not in ('full_day', 'morning', 'afternoon');

do $$
begin
  alter table public.leave_requests
    add constraint leave_requests_leave_time_segment_check
    check (leave_time_segment in ('full_day', 'morning', 'afternoon'));
exception
  when duplicate_object then null;
end $$;

create or replace function public.normalize_leave_time_segment(p_segment text)
returns text
language sql
immutable
as $$
  select case
    when p_segment in ('morning', 'afternoon') then p_segment
    else 'full_day'
  end;
$$;

create or replace function public.extract_time_minutes(p_text text, p_occurrence integer default 1)
returns integer
language plpgsql
immutable
as $$
declare
  v_match text[];
  v_seen integer := 0;
  v_marker text;
  v_hour integer;
  v_minute integer;
begin
  for v_match in
    select regexp_matches(
      coalesce(p_text, ''),
      '(上午|早上|am|a\.m\.|下午|晚上|pm|p\.m\.)?[[:space:]]*([0-9]{1,2})[[:space:]]*[:：\.．][[:space:]]*([0-5][0-9])',
      'gi'
    )
  loop
    v_marker := lower(coalesce((v_match)[1], ''));
    v_hour := (v_match)[2]::integer;
    v_minute := (v_match)[3]::integer;

    if v_hour between 0 and 23 then
      if v_marker in ('下午', '晚上', 'pm', 'p.m.') and v_hour between 1 and 11 then
        v_hour := v_hour + 12;
      elsif v_marker in ('上午', '早上', 'am', 'a.m.') and v_hour = 12 then
        v_hour := 0;
      end if;

      v_seen := v_seen + 1;
      if v_seen = greatest(coalesce(p_occurrence, 1), 1) then
        return v_hour * 60 + v_minute;
      end if;
    end if;
  end loop;

  return null;
end;
$$;

create or replace function public.leave_time_segment_overlaps_event_time(
  p_leave_time_segment text,
  p_event_time text
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_segment text := public.normalize_leave_time_segment(p_leave_time_segment);
  v_event_start integer;
  v_event_end integer;
  v_segment_start integer;
  v_segment_end integer;
begin
  if v_segment = 'full_day' then
    return true;
  end if;

  v_event_start := public.extract_time_minutes(p_event_time, 1);
  if v_event_start is null then
    return true;
  end if;

  v_event_end := public.extract_time_minutes(p_event_time, 2);
  v_segment_start := case when v_segment = 'morning' then 0 else 720 end;
  v_segment_end := case when v_segment = 'morning' then 720 else 1440 end;

  if v_event_end is null or v_event_end <= v_event_start then
    return v_event_start >= v_segment_start and v_event_start < v_segment_end;
  end if;

  return v_event_start < v_segment_end and v_event_end > v_segment_start;
end;
$$;

create or replace function public.leave_request_overlaps_event(
  p_leave_start_date date,
  p_leave_end_date date,
  p_leave_time_segment text,
  p_event_date date,
  p_event_time text default null
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_leave_end_date date := coalesce(p_leave_end_date, p_leave_start_date);
  v_segment text := public.normalize_leave_time_segment(p_leave_time_segment);
begin
  if p_leave_start_date is null or p_event_date is null then
    return false;
  end if;

  if p_leave_start_date > p_event_date or v_leave_end_date < p_event_date then
    return false;
  end if;

  if v_segment = 'full_day' or p_leave_start_date <> v_leave_end_date then
    return true;
  end if;

  return public.leave_time_segment_overlaps_event_time(v_segment, p_event_time);
end;
$$;

create or replace function public.get_match_leave_event_time(
  p_match_time text,
  p_note text default null
)
returns text
language plpgsql
immutable
as $$
declare
  v_line text;
begin
  if public.extract_time_minutes(p_match_time, 1) is not null then
    return p_match_time;
  end if;

  for v_line in
    select regexp_split_to_table(coalesce(p_note, ''), E'\\r?\\n')
  loop
    if v_line ~* '(集合時間|比賽時間|開打時間|開始時間|時間)'
      and public.extract_time_minutes(v_line, 1) is not null then
      return v_line;
    end if;
  end loop;

  if public.extract_time_minutes(p_note, 1) is not null then
    return p_note;
  end if;

  return null;
end;
$$;

drop function if exists public.list_my_leave_requests(uuid);

create function public.list_my_leave_requests(
  p_member_id uuid
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  leave_type text,
  leave_time_segment text,
  start_date date,
  end_date date,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  return query
  select
    lr.id,
    tm.id as member_id,
    tm.name::text as member_name,
    tm.role::text as member_role,
    lr.leave_type::text,
    public.normalize_leave_time_segment(lr.leave_time_segment)::text,
    lr.start_date,
    lr.end_date,
    lr.reason::text,
    lr.created_at
  from public.leave_requests lr
  join public.team_members tm
    on tm.id = lr.user_id
  where lr.user_id = p_member_id
  order by lr.start_date desc, lr.created_at desc;
end;
$$;

drop function if exists public.create_my_leave_requests(uuid, jsonb);

create function public.create_my_leave_requests(
  p_member_id uuid,
  p_records jsonb
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  leave_type text,
  leave_time_segment text,
  start_date date,
  end_date date,
  reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_name text;
  v_member_role text;
  v_record jsonb;
  v_leave_type text;
  v_leave_time_segment text;
  v_start_date date;
  v_end_date date;
  v_reason text;
  v_inserted public.leave_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if not exists (
    select 1
    from public.profiles
    where profiles.id = v_user_id
      and p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) = 0 then
    raise exception 'records must be a non-empty array';
  end if;

  select tm.name::text, tm.role::text
  into v_member_name, v_member_role
  from public.team_members tm
  where tm.id = p_member_id
    and coalesce(tm.status, '在隊') not in ('退隊', '離隊')
    and coalesce(tm.is_inactive_or_graduated, false) = false;

  if v_member_name is null then
    raise exception 'member not found or inactive';
  end if;

  for v_record in
    select value
    from jsonb_array_elements(p_records)
  loop
    v_leave_type := nullif(btrim(v_record ->> 'leave_type'), '');
    v_start_date := nullif(v_record ->> 'start_date', '')::date;
    v_end_date := coalesce(nullif(v_record ->> 'end_date', '')::date, v_start_date);
    v_leave_time_segment := public.normalize_leave_time_segment(v_record ->> 'leave_time_segment');
    v_reason := nullif(btrim(v_record ->> 'reason'), '');

    if v_leave_type is null then
      raise exception 'leave_type is required';
    end if;

    if v_start_date is null then
      raise exception 'start_date is required';
    end if;

    if v_end_date is null then
      raise exception 'end_date is required';
    end if;

    if v_end_date < v_start_date then
      raise exception 'end_date must be on or after start_date';
    end if;

    if v_start_date <> v_end_date then
      v_leave_time_segment := 'full_day';
    end if;

    insert into public.leave_requests (
      user_id,
      leave_type,
      leave_time_segment,
      start_date,
      end_date,
      reason
    )
    values (
      p_member_id,
      v_leave_type,
      v_leave_time_segment,
      v_start_date,
      v_end_date,
      v_reason
    )
    returning *
    into v_inserted;

    id := v_inserted.id;
    member_id := p_member_id;
    member_name := v_member_name;
    member_role := v_member_role;
    leave_type := v_inserted.leave_type::text;
    leave_time_segment := public.normalize_leave_time_segment(v_inserted.leave_time_segment)::text;
    start_date := v_inserted.start_date;
    end_date := v_inserted.end_date;
    reason := v_inserted.reason::text;
    created_at := v_inserted.created_at;

    return next;
  end loop;

  return;
end;
$$;

drop function if exists public.preview_match_leave_absences(date, text[]);
drop function if exists public.preview_match_leave_absences(date, text[], text);
drop function if exists public.get_match_leave_absences(uuid);
drop function if exists public.build_match_leave_absence_rows(date, text[]);
drop function if exists public.build_match_leave_absence_rows(date, text[], text);

create function public.build_match_leave_absence_rows(
  p_match_date date,
  p_player_names text[],
  p_match_time text default null
)
returns table (
  member_id uuid,
  member_name text,
  leave_type text,
  leave_time_segment text,
  start_date date,
  end_date date,
  leave_request_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  with normalized_players as (
    select distinct public.normalize_match_leave_player_name(input.player_name) as name_key
    from unnest(coalesce(p_player_names, array[]::text[])) as input(player_name)
    where public.normalize_match_leave_player_name(input.player_name) <> ''
  ),
  matched_members as (
    select distinct
      tm.id,
      tm.name::text as name
    from public.team_members tm
    join normalized_players np
      on public.normalize_match_leave_player_name(tm.name::text) = np.name_key
    where tm.role in ('球員', '校隊')
      and coalesce(tm.status::text, '在隊') = '在隊'
  ),
  matching_leave_requests as (
    select
      mm.id as member_id,
      mm.name as member_name,
      lr.id as leave_request_id,
      coalesce(nullif(btrim(lr.leave_type::text), ''), '請假') as normalized_leave_type,
      public.normalize_leave_time_segment(lr.leave_time_segment) as normalized_leave_time_segment,
      lr.start_date,
      coalesce(lr.end_date, lr.start_date) as end_date
    from matched_members mm
    join public.leave_requests lr
      on lr.user_id = mm.id
    where public.leave_request_overlaps_event(
      lr.start_date,
      lr.end_date,
      lr.leave_time_segment,
      p_match_date,
      p_match_time
    )
  )
  select
    matching_leave_requests.member_id,
    matching_leave_requests.member_name,
    string_agg(
      distinct matching_leave_requests.normalized_leave_type,
      '、'
      order by matching_leave_requests.normalized_leave_type
    ) as leave_type,
    case
      when bool_or(matching_leave_requests.normalized_leave_time_segment = 'full_day')
        or count(distinct matching_leave_requests.normalized_leave_time_segment) > 1
        then 'full_day'
      else min(matching_leave_requests.normalized_leave_time_segment)
    end as leave_time_segment,
    min(matching_leave_requests.start_date) as start_date,
    max(matching_leave_requests.end_date) as end_date,
    array_agg(
      matching_leave_requests.leave_request_id
      order by matching_leave_requests.start_date, matching_leave_requests.leave_request_id
    ) as leave_request_ids
  from matching_leave_requests
  group by matching_leave_requests.member_id, matching_leave_requests.member_name
  order by matching_leave_requests.member_name;
$$;

create function public.preview_match_leave_absences(
  p_match_date date,
  p_player_names text[],
  p_match_time text default null
)
returns table (
  member_id uuid,
  member_name text,
  leave_type text,
  leave_time_segment text,
  start_date date,
  end_date date,
  leave_request_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (
    public.has_app_permission('matches', 'CREATE')
    or public.has_app_permission('matches', 'EDIT')
  ) then
    raise exception 'permission denied';
  end if;

  if p_match_date is null or p_match_date < v_today then
    return;
  end if;

  return query
  select *
  from public.build_match_leave_absence_rows(p_match_date, p_player_names, p_match_time);
end;
$$;

create function public.get_match_leave_absences(
  p_match_id uuid
)
returns table (
  member_id uuid,
  member_name text,
  leave_type text,
  leave_time_segment text,
  start_date date,
  end_date date,
  leave_request_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_player_names text[];
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  select *
  into v_match
  from public.matches
  where matches.id = p_match_id;

  if not found or v_match.match_date is null or v_match.match_date < v_today then
    return;
  end if;

  v_player_names := array(
    select player_name
    from public.split_match_leave_player_names(v_match.players)
  );

  return query
  select *
  from public.build_match_leave_absence_rows(
    v_match.match_date,
    v_player_names,
    public.get_match_leave_event_time(v_match.match_time, v_match.note)
  );
end;
$$;

create or replace function public.sync_match_leave_absences_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_player_names text[];
  v_manual_absences jsonb := '[]'::jsonb;
  v_leave_absences jsonb := '[]'::jsonb;
  v_next_absences jsonb := '[]'::jsonb;
begin
  select *
  into v_match
  from public.matches
  where matches.id = p_match_id;

  if not found or v_match.match_date is null or v_match.match_date < v_today then
    return;
  end if;

  v_player_names := array(
    select player_name
    from public.split_match_leave_player_names(v_match.players)
  );

  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
  into v_manual_absences
  from jsonb_array_elements(
    case
      when jsonb_typeof(coalesce(v_match.absent_players, '[]'::jsonb)) = 'array'
        then coalesce(v_match.absent_players, '[]'::jsonb)
      else '[]'::jsonb
    end
  ) with ordinality as entry(value, ordinality)
  where coalesce(entry.value ->> 'source', '') <> 'leave_request';

  with leave_rows as (
    select *
    from public.build_match_leave_absence_rows(
      v_match.match_date,
      v_player_names,
      public.get_match_leave_event_time(v_match.match_time, v_match.note)
    )
  ),
  leave_rows_without_manual_duplicates as (
    select leave_rows.*
    from leave_rows
    where not exists (
      select 1
      from jsonb_array_elements(v_manual_absences) as manual_entry(value)
      where (
          nullif(manual_entry.value ->> 'member_id', '') is not null
          and manual_entry.value ->> 'member_id' = leave_rows.member_id::text
        )
        or public.normalize_match_leave_player_name(manual_entry.value ->> 'name')
          = public.normalize_match_leave_player_name(leave_rows.member_name)
    )
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', leave_rows_without_manual_duplicates.member_name,
        'type', leave_rows_without_manual_duplicates.leave_type,
        'source', 'leave_request',
        'member_id', leave_rows_without_manual_duplicates.member_id,
        'leave_request_ids', leave_rows_without_manual_duplicates.leave_request_ids,
        'leave_time_segment', leave_rows_without_manual_duplicates.leave_time_segment,
        'start_date', leave_rows_without_manual_duplicates.start_date,
        'end_date', leave_rows_without_manual_duplicates.end_date
      )
      order by leave_rows_without_manual_duplicates.member_name
    ),
    '[]'::jsonb
  )
  into v_leave_absences
  from leave_rows_without_manual_duplicates;

  v_next_absences := coalesce(v_manual_absences, '[]'::jsonb) || coalesce(v_leave_absences, '[]'::jsonb);

  if coalesce(v_match.absent_players, '[]'::jsonb) is distinct from v_next_absences then
    update public.matches
    set absent_players = v_next_absences
    where matches.id = p_match_id;
  end if;
end;
$$;

drop trigger if exists sync_match_leave_absences_after_match_change on public.matches;
create trigger sync_match_leave_absences_after_match_change
after insert or update of match_date, match_time, note, players
on public.matches
for each row
execute function public.sync_match_leave_absences_after_match_change();

create or replace function public.sync_match_fee_items_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
begin
  select *
  into v_match
  from public.matches
  where matches.id = p_match_id;

  if not found then
    return;
  end if;

  if coalesce(v_match.match_fee_amount, 0) > 0 and v_match.match_date is not null then
    with player_names as (
      select distinct
        public.normalize_match_fee_player_name(player_name) as name_key,
        player_name
      from public.split_match_fee_player_names(v_match.players)
      where public.normalize_match_fee_player_name(player_name) <> ''
    ),
    absent_names as (
      select distinct public.normalize_match_fee_player_name(value ->> 'name') as name_key
      from jsonb_array_elements(coalesce(v_match.absent_players, '[]'::jsonb)) as absent(value)
      where public.normalize_match_fee_player_name(value ->> 'name') <> ''
    ),
    eligible_members as (
      select distinct
        tm.id as member_id,
        tm.name::text as member_name
      from player_names pn
      join public.team_members tm
        on public.normalize_match_fee_player_name(tm.name::text) = pn.name_key
      where tm.role in ('球員', '校隊')
        and public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) <> 'none'
        and coalesce(tm.status::text, '在隊') = '在隊'
        and not exists (
          select 1
          from absent_names an
          where an.name_key = pn.name_key
        )
        and not exists (
          select 1
          from public.leave_requests lr
          where lr.user_id = tm.id
            and public.leave_request_overlaps_event(
              lr.start_date,
              lr.end_date,
              lr.leave_time_segment,
              v_match.match_date,
              public.get_match_leave_event_time(v_match.match_time, v_match.note)
            )
        )
    )
    insert into public.match_fee_items (
      match_id,
      member_id,
      member_name_snapshot,
      match_name_snapshot,
      tournament_name_snapshot,
      match_date_snapshot,
      match_time_snapshot,
      category_group_snapshot,
      fee_month,
      amount,
      payment_status,
      payment_submission_id,
      cancelled_at,
      cancelled_reason,
      created_at,
      updated_at
    )
    select
      v_match.id,
      em.member_id,
      em.member_name,
      coalesce(nullif(v_match.match_name, ''), '未命名賽事'),
      nullif(v_match.tournament_name, ''),
      v_match.match_date,
      nullif(v_match.match_time, ''),
      nullif(v_match.category_group, ''),
      to_char(v_match.match_date, 'YYYY-MM'),
      v_match.match_fee_amount,
      'unpaid',
      null,
      null,
      null,
      now(),
      now()
    from eligible_members em
    on conflict (match_id, member_id) where match_id is not null
    do update
    set
      member_name_snapshot = excluded.member_name_snapshot,
      match_name_snapshot = excluded.match_name_snapshot,
      tournament_name_snapshot = excluded.tournament_name_snapshot,
      match_date_snapshot = excluded.match_date_snapshot,
      match_time_snapshot = excluded.match_time_snapshot,
      category_group_snapshot = excluded.category_group_snapshot,
      fee_month = excluded.fee_month,
      amount = excluded.amount,
      payment_status = 'unpaid',
      payment_submission_id = null,
      cancelled_at = null,
      cancelled_reason = null,
      updated_at = now()
    where match_fee_items.payment_status in ('unpaid', 'cancelled')
      and match_fee_items.payment_submission_id is null;
  end if;

  with current_eligible as (
    select distinct tm.id as member_id
    from public.split_match_fee_player_names(v_match.players) pn
    join public.team_members tm
      on public.normalize_match_fee_player_name(tm.name::text) = public.normalize_match_fee_player_name(pn.player_name)
    where coalesce(v_match.match_fee_amount, 0) > 0
      and v_match.match_date is not null
      and tm.role in ('球員', '校隊')
      and coalesce(tm.status::text, '在隊') = '在隊'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(v_match.absent_players, '[]'::jsonb)) as absent(value)
        where public.normalize_match_fee_player_name(absent.value ->> 'name')
          = public.normalize_match_fee_player_name(pn.player_name)
      )
      and not exists (
        select 1
        from public.leave_requests lr
        where lr.user_id = tm.id
          and public.leave_request_overlaps_event(
            lr.start_date,
            lr.end_date,
            lr.leave_time_segment,
            v_match.match_date,
            public.get_match_leave_event_time(v_match.match_time, v_match.note)
          )
      )
  )
  update public.match_fee_items fi
  set
    payment_status = 'cancelled',
    cancelled_at = now(),
    cancelled_reason = case
      when coalesce(v_match.match_fee_amount, 0) <= 0 then '比賽費用已取消'
      else '參賽名單或請假狀態已變更'
    end,
    updated_at = now()
  where fi.match_id = v_match.id
    and fi.payment_status = 'unpaid'
    and not exists (
      select 1
      from current_eligible ce
      where ce.member_id = fi.member_id
    );
end;
$$;

create or replace function public.get_dashboard_today_attendance_status(p_today date default current_date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_today date := coalesce(p_today, current_date);
  v_today_event_ids uuid[] := array[]::uuid[];
  v_today_events jsonb := '[]'::jsonb;
  v_today_event jsonb := null;
  v_leave_names jsonb := '[]'::jsonb;
  v_leave_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('leave_requests', 'VIEW') then
    raise exception 'leave_requests:VIEW permission required';
  end if;

  with ordered_events as (
    select
      ae.id,
      ae.title,
      ae.date,
      ae.event_type,
      ae.created_at,
      case
        when ae.training_session_id is not null or ae.event_type = '特訓課' then 0
        else 1
      end as sort_priority
    from public.attendance_events ae
    where ae.date = v_today
  ),
  event_payloads as (
    select
      oe.id,
      oe.title,
      oe.created_at,
      oe.sort_priority,
      jsonb_build_object(
        'id', oe.id,
        'title', oe.title,
        'date', oe.date,
        'eventType', oe.event_type
      ) as payload
    from ordered_events oe
  )
  select
    coalesce(array_agg(ep.id order by ep.sort_priority, ep.created_at asc, ep.title asc, ep.id asc), array[]::uuid[]),
    coalesce(jsonb_agg(ep.payload order by ep.sort_priority, ep.created_at asc, ep.title asc, ep.id asc), '[]'::jsonb),
    coalesce(jsonb_agg(ep.payload order by ep.sort_priority, ep.created_at asc, ep.title asc, ep.id asc), '[]'::jsonb)->0
  into v_today_event_ids, v_today_events, v_today_event
  from event_payloads ep;

  with event_times as (
    select
      ae.id,
      coalesce(
        nullif(m.match_time, ''),
        concat_ws(' - ',
          nullif(coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), '')), ''),
          nullif(coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), '')), '')
        )
      ) as event_time
    from public.attendance_events ae
    left join public.training_location_sessions s
      on s.id = ae.training_location_session_id
    left join public.training_location_session_venues sv
      on sv.id = ae.training_location_session_venue_id
    left join public.training_session_settings tss
      on tss.id = ae.training_session_id
    left join public.matches m
      on m.id = tss.match_id
    where ae.id = any(v_today_event_ids)
  ),
  leave_members as (
    select
      tm.id as member_id,
      coalesce(nullif(tm.name, ''), '未命名球員') as member_name
    from public.leave_requests lr
    join public.team_members tm
      on tm.id = lr.user_id
    where lr.start_date <= v_today
      and lr.end_date >= v_today
      and coalesce(tm.status, '在隊') not in ('退隊', '離隊')
      and coalesce(tm.is_inactive_or_graduated, false) = false
      and (
        coalesce(array_length(v_today_event_ids, 1), 0) = 0
        or exists (
          select 1
          from event_times et
          where public.leave_request_overlaps_event(
            lr.start_date,
            lr.end_date,
            lr.leave_time_segment,
            v_today,
            et.event_time
          )
        )
      )

    union

    select
      tm.id as member_id,
      coalesce(nullif(tm.name, ''), '未命名球員') as member_name
    from public.attendance_records ar
    join public.team_members tm
      on tm.id = ar.member_id
    where ar.event_id = any(v_today_event_ids)
      and ar.status = '請假'
      and coalesce(tm.status, '在隊') not in ('退隊', '離隊')
      and coalesce(tm.is_inactive_or_graduated, false) = false
  ),
  leave_member_names as (
    select distinct on (member_id) member_name
    from leave_members
    order by member_id, member_name
  )
  select
    coalesce(jsonb_agg(member_name order by member_name), '[]'::jsonb),
    count(*)::integer
  into v_leave_names, v_leave_count
  from leave_member_names;

  return jsonb_build_object(
    'todayEvent', v_today_event,
    'todayEvents', v_today_events,
    'todayLeaveNames', v_leave_names,
    'todayLeaveCount', v_leave_count
  );
end;
$$;

create or replace function public.list_training_location_admin_sessions(
  p_from date default null,
  p_to date default null
)
returns table (
  session_id uuid,
  title text,
  training_date date,
  start_time text,
  end_time text,
  status text,
  note text,
  created_at timestamptz,
  updated_at timestamptz,
  venue_count integer,
  assignment_count integer,
  venues jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_from date := coalesce(p_from, (v_today - interval '14 days')::date);
  v_to date := coalesce(p_to, (v_today + interval '45 days')::date);
begin
  perform public.assert_training_locations_permission('VIEW');

  return query
  select
    s.id,
    s.title::text,
    s.training_date,
    s.start_time::text,
    s.end_time::text,
    s.status::text,
    s.note::text,
    s.created_at,
    s.updated_at,
    coalesce(venue_counts.venue_count, 0),
    coalesce(venue_counts.assignment_count, 0),
    coalesce(venue_rows.venues, '[]'::jsonb)
  from public.training_location_sessions s
  left join lateral (
    select
      count(distinct sv.id)::integer as venue_count,
      count(a.id)::integer as assignment_count
    from public.training_location_session_venues sv
    left join public.training_location_assignments a on a.session_venue_id = sv.id
    where sv.session_id = s.id
  ) venue_counts on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', sv.id,
        'venue_id', sv.venue_id,
        'title', coalesce(nullif(btrim(sv.title), ''), s.title),
        'training_date', coalesce(sv.training_date, s.training_date),
        'start_time', coalesce(nullif(btrim(sv.start_time), ''), s.start_time),
        'end_time', coalesce(nullif(btrim(sv.end_time), ''), s.end_time),
        'venue_name', sv.venue_name,
        'venue_address', sv.venue_address,
        'venue_maps_url', sv.venue_maps_url,
        'attendance_event_id', attendance_event.id,
        'sort_order', sv.sort_order,
        'note', coalesce(sv.note, s.note),
        'member_ids', coalesce(assignment_rows.member_ids, '[]'::jsonb),
        'assignments', coalesce(assignment_rows.assignments, '[]'::jsonb)
      )
      order by sv.sort_order asc, sv.created_at asc
    ) as venues
    from public.training_location_session_venues sv
    left join lateral (
      select ae.id
      from public.attendance_events ae
      where ae.training_location_session_venue_id = sv.id
      order by ae.created_at desc
      limit 1
    ) attendance_event on true
    left join lateral (
      select
        jsonb_agg(a.member_id order by tm.role, tm.name) as member_ids,
        jsonb_agg(
          jsonb_build_object(
            'member_id', tm.id,
            'name', tm.name,
            'role', tm.role,
            'team_group', tm.team_group,
            'jersey_number', tm.jersey_number,
            'fee_billing_mode', tm.fee_billing_mode,
            'is_on_leave', exists (
              select 1
              from public.leave_requests lr
              where lr.user_id = tm.id
                and public.leave_request_overlaps_event(
                  lr.start_date,
                  lr.end_date,
                  lr.leave_time_segment,
                  coalesce(sv.training_date, s.training_date),
                  concat_ws(' - ',
                    nullif(coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), '')), ''),
                    nullif(coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), '')), '')
                  )
                )
            )
          )
          order by tm.role, tm.name
        ) as assignments
      from public.training_location_assignments a
      join public.team_members_safe tm on tm.id = a.member_id
      where a.session_venue_id = sv.id
    ) assignment_rows on true
    where sv.session_id = s.id
  ) venue_rows on true
  where s.training_date between v_from and v_to
  order by s.training_date asc, coalesce(s.start_time, '23:59') asc, s.created_at desc;
end;
$$;

create or replace function public.list_my_week_training_locations(p_week_start date default null)
returns table (
  session_id uuid,
  member_id uuid,
  member_name text,
  title text,
  training_date date,
  start_time text,
  end_time text,
  venue_name text,
  venue_address text,
  venue_maps_url text,
  is_on_leave boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_week_start date := coalesce(
    p_week_start,
    (v_today - ((extract(isodow from v_today)::integer - 1) * interval '1 day'))::date
  );
  v_linked_ids uuid[] := '{}'::uuid[];
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.linked_team_member_ids, array[]::uuid[])
  into v_linked_ids
  from public.profiles p
  where p.id = v_user_id;

  return query
  select
    s.id,
    tm.id,
    tm.name::text,
    coalesce(nullif(btrim(sv.title), ''), s.title)::text,
    coalesce(sv.training_date, s.training_date),
    coalesce(nullif(btrim(sv.start_time), ''), s.start_time)::text,
    coalesce(nullif(btrim(sv.end_time), ''), s.end_time)::text,
    sv.venue_name::text,
    sv.venue_address::text,
    sv.venue_maps_url::text,
    exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = tm.id
        and public.leave_request_overlaps_event(
          lr.start_date,
          lr.end_date,
          lr.leave_time_segment,
          coalesce(sv.training_date, s.training_date),
          concat_ws(' - ',
            nullif(coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), '')), ''),
            nullif(coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), '')), '')
          )
        )
    ) as is_on_leave
  from public.training_location_assignments a
  join public.training_location_sessions s on s.id = a.session_id
  join public.training_location_session_venues sv on sv.id = a.session_venue_id
  join public.team_members_safe tm on tm.id = a.member_id
  where a.member_id = any(v_linked_ids)
    and s.status = 'published'
    and coalesce(sv.training_date, s.training_date) between v_week_start and (v_week_start + interval '6 days')::date
  order by coalesce(sv.training_date, s.training_date) asc,
    coalesce(nullif(btrim(sv.start_time), ''), s.start_time, '23:59') asc,
    tm.name;
end;
$$;

create or replace function public.list_training_location_notification_targets(
  p_target_date date,
  p_session_id uuid default null
)
returns table (
  user_id uuid,
  session_id uuid,
  session_updated_at timestamptz,
  member_id uuid,
  member_name text,
  title text,
  training_date date,
  start_time text,
  end_time text,
  venue_name text,
  venue_address text,
  venue_maps_url text,
  is_on_leave boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_date date := coalesce(p_target_date, ((now() at time zone 'Asia/Taipei')::date + 1));
begin
  return query
  select
    p.id,
    s.id,
    s.updated_at,
    tm.id,
    tm.name::text,
    coalesce(nullif(btrim(sv.title), ''), s.title)::text,
    coalesce(sv.training_date, s.training_date),
    coalesce(nullif(btrim(sv.start_time), ''), s.start_time)::text,
    coalesce(nullif(btrim(sv.end_time), ''), s.end_time)::text,
    sv.venue_name::text,
    sv.venue_address::text,
    sv.venue_maps_url::text,
    false as is_on_leave
  from public.training_location_assignments a
  join public.training_location_sessions s on s.id = a.session_id
  join public.training_location_session_venues sv on sv.id = a.session_venue_id
  join public.team_members tm on tm.id = a.member_id
  join public.profiles p on a.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
  where s.status = 'published'
    and (
      (p_session_id is not null and p_target_date is null)
      or coalesce(sv.training_date, s.training_date) = v_target_date
    )
    and (p_session_id is null or s.id = p_session_id)
    and coalesce(p.is_active, true) is not false
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now())
    and tm.role in ('球員', '校隊')
    and coalesce(tm.status, '') not in ('退隊', '離隊')
    and not exists (
      select 1
      from public.leave_requests lr
      where lr.user_id = a.member_id
        and public.leave_request_overlaps_event(
          lr.start_date,
          lr.end_date,
          lr.leave_time_segment,
          coalesce(sv.training_date, s.training_date),
          concat_ws(' - ',
            nullif(coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), '')), ''),
            nullif(coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), '')), '')
          )
        )
    )
  order by p.id,
    coalesce(sv.training_date, s.training_date),
    coalesce(nullif(btrim(sv.start_time), ''), s.start_time, '23:59'),
    tm.name;
end;
$$;

revoke all on function public.normalize_leave_time_segment(text) from public;
revoke all on function public.extract_time_minutes(text, integer) from public;
revoke all on function public.leave_time_segment_overlaps_event_time(text, text) from public;
revoke all on function public.leave_request_overlaps_event(date, date, text, date, text) from public;
revoke all on function public.get_match_leave_event_time(text, text) from public;
revoke all on function public.build_match_leave_absence_rows(date, text[], text) from public, anon, authenticated;
revoke all on function public.sync_match_leave_absences_for_match(uuid) from public, anon, authenticated;
revoke all on function public.preview_match_leave_absences(date, text[], text) from public, anon, authenticated;
revoke all on function public.get_match_leave_absences(uuid) from public, anon, authenticated;
revoke all on function public.sync_match_fee_items_for_match(uuid) from public;
revoke all on function public.get_dashboard_today_attendance_status(date) from public;
revoke all on function public.get_dashboard_today_attendance_status(date) from anon;
revoke all on function public.list_training_location_admin_sessions(date, date) from public;
revoke all on function public.list_training_location_admin_sessions(date, date) from anon;
revoke all on function public.list_my_week_training_locations(date) from public;
revoke all on function public.list_my_week_training_locations(date) from anon;
revoke all on function public.list_training_location_notification_targets(date, uuid) from public;
revoke all on function public.list_training_location_notification_targets(date, uuid) from anon;

grant execute on function public.normalize_leave_time_segment(text) to authenticated, service_role;
grant execute on function public.extract_time_minutes(text, integer) to authenticated, service_role;
grant execute on function public.leave_time_segment_overlaps_event_time(text, text) to authenticated, service_role;
grant execute on function public.leave_request_overlaps_event(date, date, text, date, text) to authenticated, service_role;
grant execute on function public.get_match_leave_event_time(text, text) to authenticated, service_role;
grant execute on function public.list_my_leave_requests(uuid) to authenticated;
grant execute on function public.create_my_leave_requests(uuid, jsonb) to authenticated;
grant execute on function public.preview_match_leave_absences(date, text[], text) to authenticated;
grant execute on function public.get_match_leave_absences(uuid) to authenticated;
grant execute on function public.sync_match_fee_items_for_match(uuid) to authenticated, service_role;
grant execute on function public.get_dashboard_today_attendance_status(date) to authenticated, service_role;
grant execute on function public.list_training_location_admin_sessions(date, date) to authenticated, service_role;
grant execute on function public.list_my_week_training_locations(date) to authenticated, service_role;
grant execute on function public.list_training_location_notification_targets(date, uuid) to service_role;

notify pgrst, 'reload schema';

commit;
