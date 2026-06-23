begin;

create or replace function public.normalize_match_leave_player_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(p_name, ''), '[\s·‧・．.]', '', 'g'));
$$;

create or replace function public.split_match_leave_player_names(p_players text)
returns table (player_name text)
language sql
immutable
as $$
  with parsed_names as (
    select nullif(btrim(regexp_replace(raw_name, '^\s*[0-9]{1,3}\s*[.)、．-]\s*', '')), '') as player_name
    from regexp_split_to_table(coalesce(p_players, ''), '[,，、/;；\n]+') as raw_name
    where nullif(btrim(raw_name), '') is not null
  )
  select parsed_names.player_name
  from parsed_names
  where parsed_names.player_name is not null
    and parsed_names.player_name !~ '^[[:space:]]*比賽費用[[:space:]]*[:：]?.*$'
    and parsed_names.player_name !~ '^[[:space:]]*[0-9]([0-9,]|[[:space:]])*元?[[:space:]]*$';
$$;

drop function if exists public.build_match_leave_absence_rows(date, text[]);
create function public.build_match_leave_absence_rows(
  p_match_date date,
  p_player_names text[]
)
returns table (
  member_id uuid,
  member_name text,
  leave_type text,
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
      lr.start_date,
      coalesce(lr.end_date, lr.start_date) as end_date
    from matched_members mm
    join public.leave_requests lr
      on lr.user_id = mm.id
    where p_match_date is not null
      and lr.start_date <= p_match_date
      and coalesce(lr.end_date, lr.start_date) >= p_match_date
  )
  select
    matching_leave_requests.member_id,
    matching_leave_requests.member_name,
    string_agg(
      distinct matching_leave_requests.normalized_leave_type,
      '、'
      order by matching_leave_requests.normalized_leave_type
    ) as leave_type,
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

drop function if exists public.preview_match_leave_absences(date, text[]);
create function public.preview_match_leave_absences(
  p_match_date date,
  p_player_names text[]
)
returns table (
  member_id uuid,
  member_name text,
  leave_type text,
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
  from public.build_match_leave_absence_rows(p_match_date, p_player_names);
end;
$$;

drop function if exists public.get_match_leave_absences(uuid);
create function public.get_match_leave_absences(
  p_match_id uuid
)
returns table (
  member_id uuid,
  member_name text,
  leave_type text,
  start_date date,
  end_date date,
  leave_request_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_date date;
  v_player_names text[];
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  select
    matches.match_date,
    array(
      select player_name
      from public.split_match_leave_player_names(matches.players)
    )
  into v_match_date, v_player_names
  from public.matches
  where matches.id = p_match_id;

  if v_match_date is null or v_match_date < v_today then
    return;
  end if;

  return query
  select *
  from public.build_match_leave_absence_rows(v_match_date, v_player_names);
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
    from public.build_match_leave_absence_rows(v_match.match_date, v_player_names)
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

create or replace function public.sync_match_leave_absences_after_match_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_match_leave_absences_for_match(new.id);
  return new;
end;
$$;

create or replace function public.sync_match_leave_absences_after_leave_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_member_ids uuid[];
  v_match record;
begin
  if tg_op = 'DELETE' then
    v_start_date := old.start_date;
    v_end_date := coalesce(old.end_date, old.start_date);
    v_member_ids := array[old.user_id];
  elsif tg_op = 'UPDATE' then
    v_start_date := least(
      coalesce(old.start_date, new.start_date),
      coalesce(new.start_date, old.start_date)
    );
    v_end_date := greatest(
      coalesce(old.end_date, old.start_date, new.end_date, new.start_date),
      coalesce(new.end_date, new.start_date, old.end_date, old.start_date)
    );
    v_member_ids := array(
      select distinct member_id
      from unnest(array[old.user_id, new.user_id]) as affected(member_id)
      where member_id is not null
    );
  else
    v_start_date := new.start_date;
    v_end_date := coalesce(new.end_date, new.start_date);
    v_member_ids := array[new.user_id];
  end if;

  if v_start_date is null or v_end_date is null or coalesce(array_length(v_member_ids, 1), 0) = 0 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  for v_match in
    select distinct matches.id
    from public.matches
    where matches.match_date between v_start_date and v_end_date
      and matches.match_date >= v_today
      and exists (
        select 1
        from unnest(v_member_ids) as affected(member_id)
        join public.team_members tm
          on tm.id = affected.member_id
        join public.split_match_leave_player_names(matches.players) as match_player(player_name)
          on public.normalize_match_leave_player_name(tm.name::text)
            = public.normalize_match_leave_player_name(match_player.player_name)
      )
  loop
    perform public.sync_match_leave_absences_for_match(v_match.id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_match_leave_absences_after_match_change on public.matches;
create trigger sync_match_leave_absences_after_match_change
after insert or update of match_date, players
on public.matches
for each row
execute function public.sync_match_leave_absences_after_match_change();

drop trigger if exists sync_match_leave_absences_after_leave_change on public.leave_requests;
create trigger sync_match_leave_absences_after_leave_change
after insert or update or delete on public.leave_requests
for each row
execute function public.sync_match_leave_absences_after_leave_change();

revoke all on function public.build_match_leave_absence_rows(date, text[]) from public, anon, authenticated;
revoke all on function public.sync_match_leave_absences_for_match(uuid) from public, anon, authenticated;
revoke all on function public.sync_match_leave_absences_after_match_change() from public, anon, authenticated;
revoke all on function public.sync_match_leave_absences_after_leave_change() from public, anon, authenticated;
revoke all on function public.preview_match_leave_absences(date, text[]) from public, anon, authenticated;
revoke all on function public.get_match_leave_absences(uuid) from public, anon, authenticated;
grant execute on function public.preview_match_leave_absences(date, text[]) to authenticated;
grant execute on function public.get_match_leave_absences(uuid) to authenticated;

commit;
