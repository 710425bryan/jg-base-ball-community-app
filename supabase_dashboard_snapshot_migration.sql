begin;

create or replace function public.get_dashboard_snapshot(p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_permissions text[] := '{}'::text[];
  v_is_admin boolean := false;
  v_can_announcements boolean := false;
  v_can_join boolean := false;
  v_can_leave boolean := false;
  v_can_fees boolean := false;
  v_can_attendance boolean := false;
  v_today date := coalesce(p_today, current_date);
  v_week_end date := coalesce(p_today, current_date) + 6;
  v_stats jsonb;
  v_pending_counts jsonb := jsonb_build_object(
    'joinInquiries', 0,
    'unpaidFees', 0,
    'upcomingLeaves', 0,
    'weeklyEvents', 0
  );
  v_today_event jsonb := null;
  v_recent_announcements jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = v_user_id;

  v_is_admin := v_role = 'ADMIN';

  if not v_is_admin and v_role is not null then
    select coalesce(array_agg(arp.feature), '{}'::text[])
    into v_permissions
    from public.app_role_permissions arp
    where arp.role_key = v_role
      and arp.action = 'VIEW';
  end if;

  v_can_announcements := v_is_admin or 'announcements' = any(v_permissions);
  v_can_join := v_is_admin or 'join_inquiries' = any(v_permissions);
  v_can_leave := v_is_admin or 'leave_requests' = any(v_permissions);
  v_can_fees := v_is_admin or 'fees' = any(v_permissions);
  v_can_attendance := v_is_admin or 'attendance' = any(v_permissions);

  select jsonb_build_object(
    'totalMembers', count(*) filter (
      where tm.role in ('球員', '校隊')
        and tm.status is distinct from '離隊'
    ),
    'schoolTeamMembers', count(*) filter (
      where tm.role = '校隊'
        and tm.status is distinct from '離隊'
    ),
    'communityMembers', count(*) filter (
      where tm.role = '球員'
        and tm.status is distinct from '離隊'
    ),
    'todayLeaves',
    case
      when v_can_leave then count(*) filter (
        where false
      )
      else 0
    end
  )
  into v_stats
  from public.team_members tm;

  if v_can_leave then
    v_stats := jsonb_set(
      v_stats,
      '{todayLeaves}',
      to_jsonb((
        select count(*)
        from public.leave_requests lr
        where lr.start_date <= v_today
          and lr.end_date >= v_today
      ))
    );

    v_pending_counts := jsonb_set(
      v_pending_counts,
      '{upcomingLeaves}',
      to_jsonb((
        select count(*)
        from public.leave_requests lr
        where lr.end_date >= v_today
          and lr.start_date <= v_week_end
      ))
    );
  end if;

  if v_can_join then
    v_pending_counts := jsonb_set(
      v_pending_counts,
      '{joinInquiries}',
      to_jsonb((
        select count(*)
        from public.join_inquiries ji
        where ji.status <> 'completed'
      ))
    );
  end if;

  if v_can_fees then
    v_pending_counts := jsonb_set(
      v_pending_counts,
      '{unpaidFees}',
      to_jsonb((
        select count(*)
        from public.quarterly_fees qf
        where qf.status <> 'paid'
      ))
    );
  end if;

  if v_can_attendance then
    select to_jsonb(event_row)
    into v_today_event
    from (
      select
        ae.id,
        ae.title,
        ae.date,
        ae.event_type as "eventType",
        ae.created_at as "createdAt"
      from public.attendance_events ae
      where ae.date = v_today
      order by ae.created_at asc
      limit 1
    ) event_row;
  end if;

  if v_can_announcements then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'title', a.title,
          'content', a.content,
          'createdAt', a.created_at,
          'isPinned', a.is_pinned
        )
        order by a.is_pinned desc, a.created_at desc
      ),
      '[]'::jsonb
    )
    into v_recent_announcements
    from (
      select
        ann.id,
        ann.title,
        ann.content,
        ann.created_at,
        ann.is_pinned
      from public.announcements ann
      order by ann.is_pinned desc, ann.created_at desc
      limit 3
    ) a;
  end if;

  return jsonb_build_object(
    'stats', v_stats,
    'pendingCounts', v_pending_counts,
    'todayEvent', v_today_event,
    'recentAnnouncements', v_recent_announcements
  );
end;
$$;

revoke all on function public.get_dashboard_snapshot(date) from public;
grant execute on function public.get_dashboard_snapshot(date) to authenticated, service_role;

create or replace function public.get_notification_feed(p_limit integer default 10)
returns table (
  id text,
  source text,
  title text,
  body text,
  created_at timestamptz,
  link text,
  highlight_member_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_permissions text[] := '{}'::text[];
  v_is_admin boolean := false;
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = v_user_id;

  v_is_admin := v_role = 'ADMIN';

  if not v_is_admin and v_role is not null then
    select coalesce(array_agg(arp.feature), '{}'::text[])
    into v_permissions
    from public.app_role_permissions arp
    where arp.role_key = v_role
      and arp.action = 'VIEW';
  end if;

  return query
  with limit_settings as (
    select v_limit as feed_limit
  ),
  leave_items as (
    select
      lr.id::text as id,
      'leave'::text as source,
      format('[新增假單] %s 的%s', coalesce(tm.name, '未知球員'), coalesce(lr.leave_type, '假單')) as title,
      format(
        E'日期：%s ~ %s\n原因：%s',
        lr.start_date,
        lr.end_date,
        coalesce(nullif(lr.reason, ''), '無')
      ) as body,
      lr.created_at,
      format('/leave-requests?highlight_leave_id=%s', lr.id::text) as link,
      null::uuid as highlight_member_id
    from public.leave_requests lr
    left join public.team_members tm on tm.id = lr.user_id
    where v_is_admin or 'leave_requests' = any(v_permissions)
    order by lr.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  member_items as (
    select
      tm.id::text as id,
      'member'::text as source,
      format('[新進通知] 歡迎 %s 入隊！', coalesce(tm.name, '未知球員')) as title,
      format('剛從表單收到了 %s (%s) 的球員資料。', coalesce(tm.name, '未知球員'), coalesce(tm.role, '球員')) as body,
      tm.created_at,
      '/players'::text as link,
      null::uuid as highlight_member_id
    from public.team_members tm
    where v_is_admin or 'players' = any(v_permissions)
    order by tm.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  join_items as (
    select
      ji.id::text as id,
      'join'::text as source,
      format('[入隊詢問] 收到來自 %s 的聯絡', coalesce(ji.parent_name, '未知家長')) as title,
      format('電話: %s。請盡快與家長聯繫！', coalesce(ji.phone, '-')) as body,
      ji.created_at,
      '/join-inquiries'::text as link,
      null::uuid as highlight_member_id
    from public.join_inquiries ji
    where v_is_admin or 'join_inquiries' = any(v_permissions)
    order by ji.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  fee_items as (
    select
      qf.id::text as id,
      'fee'::text as source,
      format('[新增匯款] 收到 %s 的繳費登記', coalesce(fee_members.member_names, '未知球員')) as title,
      format(
        '季度: %s | 方式: %s | 金額: $%s',
        coalesce(qf.year_quarter, '-'),
        coalesce(qf.payment_method, '-'),
        coalesce(qf.amount::text, '0')
      ) as body,
      qf.created_at,
      format(
        '/fees?tab=%s&highlight_fee_id=%s&highlight_member_id=%s',
        case
          when coalesce(fee_members.primary_role, '球員') = '校隊' then 'monthly'
          else 'quarterly'
        end,
        qf.id::text,
        coalesce(fee_members.highlight_member_id::text, '')
      ) as link,
      fee_members.highlight_member_id
    from public.quarterly_fees qf
    left join lateral (
      with expanded_ids as (
        select
          ids.member_id,
          ids.ordinality
        from unnest(
          case
            when qf.member_ids is not null and cardinality(qf.member_ids) > 0 then qf.member_ids
            when qf.member_id is not null then array[qf.member_id]
            else array[]::uuid[]
          end
        ) with ordinality as ids(member_id, ordinality)
      )
      select
        string_agg(coalesce(tm.name, '未知球員'), ', ' order by expanded_ids.ordinality) as member_names,
        (array_agg(coalesce(tm.role, '球員') order by expanded_ids.ordinality))[1] as primary_role,
        (array_agg(expanded_ids.member_id order by expanded_ids.ordinality))[1] as highlight_member_id
      from expanded_ids
      left join public.team_members tm on tm.id = expanded_ids.member_id
    ) fee_members on true
    where v_is_admin or 'fees' = any(v_permissions)
    order by qf.created_at desc
    limit (select feed_limit from limit_settings)
  )
  select
    feed.id,
    feed.source,
    feed.title,
    feed.body,
    feed.created_at,
    feed.link,
    feed.highlight_member_id
  from (
    select * from leave_items
    union all
    select * from member_items
    union all
    select * from join_items
    union all
    select * from fee_items
  ) feed
  order by feed.created_at desc
  limit (select feed_limit from limit_settings);
end;
$$;

revoke all on function public.get_notification_feed(integer) from public;
grant execute on function public.get_notification_feed(integer) to authenticated, service_role;

commit;
