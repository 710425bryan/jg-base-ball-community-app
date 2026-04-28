begin;

create or replace function public.get_my_home_snapshot(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := coalesce(p_today, current_date);
  v_linked_ids uuid[] := '{}'::uuid[];
  v_members jsonb := '[]'::jsonb;
  v_next_event jsonb := null;
  v_today_leaves jsonb := '[]'::jsonb;
  v_payment_summary jsonb;
  v_equipment_summary jsonb;
  v_recent_notifications jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(profiles.linked_team_member_ids, array[]::uuid[])
  into v_linked_ids
  from public.profiles
  where profiles.id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tm.id,
        'name', tm.name,
        'role', tm.role,
        'team_group', tm.team_group,
        'status', tm.status,
        'jersey_number', tm.jersey_number,
        'avatar_url', tm.avatar_url
      )
      order by
        case when tm.role = '校隊' then 0 when tm.role = '球員' then 1 else 2 end,
        tm.name
    ),
    '[]'::jsonb
  )
  into v_members
  from public.team_members_safe tm
  where tm.id = any(v_linked_ids)
    and tm.role in ('球員', '校隊');

  select to_jsonb(event_row)
  into v_next_event
  from (
    with event_candidates as (
      select
        m.id,
        'match'::text as type,
        coalesce(nullif(m.match_name, ''), nullif(m.opponent, ''), '賽事')::text as title,
        m.match_date::date as event_date,
        m.match_date::text as date,
        nullif(m.match_time, '')::text as time,
        nullif(m.location, '')::text as location,
        nullif(m.opponent, '')::text as opponent,
        nullif(m.category_group, '')::text as category_group,
        nullif(m.match_level, '')::text as match_level,
        nullif(m.coaches, '')::text as coaches,
        nullif(m.players, '')::text as players,
        format('/match-records?match_id=%s', m.id::text) as route
      from public.matches m
      where m.match_date >= v_today

      union all

      select
        ae.id,
        'attendance'::text as type,
        coalesce(nullif(ae.title, ''), '球隊活動')::text as title,
        ae.date::date as event_date,
        ae.date::text as date,
        null::text as time,
        null::text as location,
        null::text as opponent,
        null::text as category_group,
        nullif(ae.event_type, '')::text as match_level,
        null::text as coaches,
        null::text as players,
        '/calendar'::text as route
      from public.attendance_events ae
      where ae.date >= v_today
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
      route
    from event_candidates
    order by event_date asc, coalesce(time, '23:59') asc
    limit 1
  ) event_row;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', lr.id,
        'member_id', tm.id,
        'member_name', tm.name,
        'leave_type', lr.leave_type,
        'start_date', lr.start_date,
        'end_date', lr.end_date,
        'reason', lr.reason
      )
      order by tm.name, lr.start_date
    ),
    '[]'::jsonb
  )
  into v_today_leaves
  from public.leave_requests lr
  join public.team_members_safe tm on tm.id = lr.user_id
  where lr.user_id = any(v_linked_ids)
    and lr.start_date <= v_today
    and lr.end_date >= v_today;

  with official_due as (
    select
      mf.member_id,
      tm.name::text as member_name,
      'monthly'::text as billing_mode,
      mf.year_month::text as period_label,
      coalesce(mf.payable_amount, 0)::integer as amount,
      coalesce(mf.status, 'unpaid')::text as status,
      mf.updated_at
    from public.monthly_fees mf
    join public.team_members_safe tm on tm.id = mf.member_id
    where mf.member_id = any(v_linked_ids)
      and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')

    union all

    select
      matched_member.id as member_id,
      matched_member.name::text as member_name,
      'quarterly'::text as billing_mode,
      qf.year_quarter::text as period_label,
      coalesce(qf.amount, 0)::integer as amount,
      coalesce(qf.status, 'pending_review')::text as status,
      qf.updated_at
    from public.quarterly_fees qf
    join lateral (
      select tm.id, tm.name
      from public.team_members_safe tm
      where tm.id = any(v_linked_ids)
        and (
          tm.id = qf.member_id
          or tm.id = any(coalesce(qf.member_ids, array[]::uuid[]))
        )
      order by tm.name
      limit 1
    ) matched_member on true
    where (
        qf.member_id = any(v_linked_ids)
        or coalesce(qf.member_ids, array[]::uuid[]) && v_linked_ids
      )
      and coalesce(qf.status, 'pending_review') not in ('paid', 'approved')
  ),
  pending_submissions as (
    select count(*)::integer as total
    from public.profile_payment_submissions pps
    where pps.member_id = any(v_linked_ids)
      and pps.status = 'pending_review'
  ),
  next_due_row as (
    select *
    from official_due
    order by updated_at desc nulls last, period_label desc
    limit 1
  )
  select jsonb_build_object(
    'unpaid_count', coalesce(count(*) filter (where status = 'unpaid'), 0),
    'pending_review_count', coalesce(count(*) filter (where status = 'pending_review'), 0) + coalesce((select total from pending_submissions), 0),
    'total_unpaid_amount', coalesce(sum(amount) filter (where status = 'unpaid'), 0),
    'next_due', coalesce((select to_jsonb(next_due_row) from next_due_row), 'null'::jsonb)
  )
  into v_payment_summary
  from official_due;

  with request_rows as (
    select
      r.id,
      r.member_id,
      tm.name::text as member_name,
      r.status::text,
      count(ri.id)::integer as item_count,
      coalesce(sum(coalesce(ri.unit_price_snapshot, 0) * coalesce(ri.quantity, 0)), 0)::integer as total_amount,
      r.updated_at
    from public.equipment_purchase_requests r
    join public.team_members_safe tm on tm.id = r.member_id
    left join public.equipment_purchase_request_items ri on ri.request_id = r.id
    where r.member_id = any(v_linked_ids)
      and r.status not in ('rejected', 'cancelled')
    group by r.id, r.member_id, tm.name, r.status, r.updated_at
  ),
  equipment_payment_rows as (
    select
      t.id,
      t.member_id,
      coalesce(t.payment_status, 'unpaid')::text as payment_status,
      coalesce(coalesce(t.unit_price, e.purchase_price, 0) * coalesce(t.quantity, 0), 0)::integer as total_amount
    from public.equipment_transactions t
    join public.equipment e on e.id = t.equipment_id
    join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
    join public.equipment_purchase_requests r on r.id = ri.request_id
    where t.member_id = any(v_linked_ids)
      and t.transaction_type = 'purchase'
      and r.status = 'picked_up'
      and coalesce(t.payment_status, 'unpaid') in ('unpaid', 'pending_review')
  ),
  latest_request_row as (
    select *
    from request_rows
    order by updated_at desc nulls last
    limit 1
  )
  select jsonb_build_object(
    'active_request_count', coalesce((select count(*) from request_rows where status in ('pending', 'approved', 'ready_for_pickup')), 0),
    'ready_for_pickup_count', coalesce((select count(*) from request_rows where status = 'ready_for_pickup'), 0),
    'picked_up_unpaid_count', coalesce((select count(*) from equipment_payment_rows where payment_status = 'unpaid'), 0),
    'pending_payment_count', coalesce((select count(*) from equipment_payment_rows where payment_status = 'pending_review'), 0),
    'unpaid_amount', coalesce((select sum(total_amount) from equipment_payment_rows where payment_status = 'unpaid'), 0),
    'latest_request', coalesce((select to_jsonb(latest_request_row) from latest_request_row), 'null'::jsonb)
  )
  into v_equipment_summary;

  select coalesce(jsonb_agg(to_jsonb(feed_row) order by feed_row.created_at desc), '[]'::jsonb)
  into v_recent_notifications
  from public.get_notification_feed(5) feed_row;

  return jsonb_build_object(
    'members', v_members,
    'next_event', v_next_event,
    'today_leaves', v_today_leaves,
    'payment_summary', v_payment_summary,
    'equipment_summary', v_equipment_summary,
    'recent_notifications', v_recent_notifications,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_my_home_snapshot(date) from public;
grant execute on function public.get_my_home_snapshot(date) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
