begin;

create or replace function public.get_my_home_next_event(
  p_member_id uuid default null,
  p_today date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_taipei_now timestamp := now() at time zone 'Asia/Taipei';
  v_today date := coalesce(p_today, v_taipei_now::date);
  v_current_time time := case
    when coalesce(p_today, v_taipei_now::date) = v_taipei_now::date then v_taipei_now::time
    else '00:00'::time
  end;
  v_next_event jsonb := null;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_member_id is not null and not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p_member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
  ) then
    raise exception 'member not linked to current profile';
  end if;

  select to_jsonb(event_row)
  into v_next_event
  from (
    with event_candidates as (
      select
        m.id,
        'match'::text as type,
        coalesce(nullif(m.match_name, ''), nullif(m.opponent, ''), '賽事')::text as title,
        m.match_date::date as event_date,
        (mt.start_token)::time as event_start_time,
        coalesce(
          (mt.end_token)::time,
          case
            when mt.start_token is not null then ((mt.start_token)::time + interval '2 hours')::time
            else '23:59'::time
          end
        ) as event_end_time,
        m.match_date::text as date,
        nullif(m.match_time, '')::text as time,
        nullif(m.location, '')::text as location,
        nullif(m.opponent, '')::text as opponent,
        nullif(m.category_group, '')::text as category_group,
        nullif(m.match_level, '')::text as match_level,
        nullif(m.coaches, '')::text as coaches,
        nullif(m.players, '')::text as players,
        format('/calendar?match_id=%s', m.id::text) as route,
        case
          when btrim(coalesce(m.match_level, '')) = '特訓課' then tr.status::text
          else null::text
        end as training_registration_status,
        case
          when btrim(coalesce(m.match_level, '')) = '特訓課'
            and tr.status in ('applied', 'selected', 'waitlisted')
          then public.is_training_registration_window_open(
            tss.manual_status,
            tss.registration_start_at,
            tss.registration_end_at
          )
          else false
        end as is_training_registration_open
      from public.matches m
      cross join lateral (
        select
          substring(nullif(m.match_time, '') from '([0-9]{1,2}:[0-5][0-9])') as start_token,
          substring(nullif(m.match_time, '') from '[0-9]{1,2}:[0-5][0-9][[:space:]]*[-~－—–][[:space:]]*([0-9]{1,2}:[0-5][0-9])') as end_token
      ) mt
      left join public.training_session_settings tss
        on tss.match_id = m.id
      left join public.training_registrations tr
        on tr.session_id = tss.id
       and tr.member_id = p_member_id
      where m.match_date >= v_today
        and (
          btrim(coalesce(m.match_level, '')) <> '特訓課'
          or tr.status in ('applied', 'selected', 'waitlisted')
        )
    )
    select
      id,
      type,
      title,
      date,
      time,
      location,
      opponent,
      category_group,
      match_level,
      coaches,
      players,
      route,
      training_registration_status,
      is_training_registration_open
    from event_candidates
    where event_date > v_today
      or event_end_time > v_current_time
    order by event_date asc, coalesce(event_start_time, '23:59'::time) asc
    limit 1
  ) event_row;

  return v_next_event;
end;
$$;

revoke all on function public.get_my_home_next_event(uuid, date) from public;
revoke all on function public.get_my_home_next_event(uuid, date) from anon;
grant execute on function public.get_my_home_next_event(uuid, date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
