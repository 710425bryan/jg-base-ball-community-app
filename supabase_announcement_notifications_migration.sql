begin;

alter table public.push_dispatch_events
  add column if not exists body text;

create index if not exists idx_push_dispatch_events_announcements
  on public.push_dispatch_events (created_at desc)
  where feature = 'announcements' and action = 'VIEW';

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
  ),
  match_items as (
    select
      pde.id::text as id,
      'match'::text as source,
      coalesce(nullif(pde.title, ''), '明日賽事提醒') as title,
      coalesce(nullif(pde.body, ''), '明天有比賽，請查看賽事資訊。') as body,
      pde.created_at,
      coalesce(
        nullif(pde.url, ''),
        case
          when pde.match_id is not null then format('/match-records?match_id=%s', pde.match_id::text)
          else '/match-records'
        end
      ) as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'matches'
      and pde.action = 'REMINDER'
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  announcement_items as (
    select
      pde.event_key as id,
      'announcement'::text as source,
      coalesce(nullif(pde.title, ''), '系統公告') as title,
      coalesce(nullif(pde.body, ''), '請查看最新公告內容。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/announcements') as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'announcements'
      and pde.action = 'VIEW'
      and (v_is_admin or 'announcements' = any(v_permissions))
    order by pde.created_at desc
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
    union all
    select * from match_items
    union all
    select * from announcement_items
  ) feed
  order by feed.created_at desc
  limit (select feed_limit from limit_settings);
end;
$$;

revoke all on function public.get_notification_feed(integer) from public;
grant execute on function public.get_notification_feed(integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
