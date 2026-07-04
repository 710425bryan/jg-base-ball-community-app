begin;

create index if not exists idx_push_dispatch_events_match_health_alerts
  on public.push_dispatch_events (target_user_id, created_at desc)
  where feature = 'matches' and action = 'HEALTH_ALERT';

create or replace function public.get_match_reminder_health_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, extensions, cron, net
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_job_id bigint;
  v_job_schedule text;
  v_job_active boolean := false;
  v_last_run_status text;
  v_last_run_return_message text;
  v_last_run_start_time timestamptz;
  v_last_run_end_time timestamptz;
  v_last_http_status_code integer;
  v_last_http_timed_out boolean := false;
  v_last_http_error_message text;
  v_last_http_created_at timestamptz;
  v_config jsonb;
  v_config_enabled boolean := false;
  v_rule_count integer := 0;
  v_recent_alert_count integer := 0;
  v_status text := 'healthy';
  v_messages text[] := '{}'::text[];
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = v_user_id;

  if v_role <> 'ADMIN' then
    raise exception 'permission denied for match reminder health status';
  end if;

  select ss.value
  into v_config
  from public.system_settings ss
  where ss.key = 'match_reminder_schedule_config';

  v_config_enabled := case
    when jsonb_typeof(v_config->'enabled') = 'boolean' then coalesce((v_config->>'enabled')::boolean, false)
    else false
  end;
  v_rule_count := case
    when jsonb_typeof(v_config->'rules') = 'array' then jsonb_array_length(v_config->'rules')
    else 0
  end;

  select j.jobid, j.schedule, j.active
  into v_job_id, v_job_schedule, v_job_active
  from cron.job j
  where j.jobname = 'match-reminder-checker'
  order by j.jobid desc
  limit 1;

  if v_job_id is not null then
    select d.status, d.return_message, d.start_time, d.end_time
    into v_last_run_status, v_last_run_return_message, v_last_run_start_time, v_last_run_end_time
    from cron.job_run_details d
    where d.jobid = v_job_id
    order by d.start_time desc
    limit 1;
  end if;

  select r.status_code, r.timed_out, r.error_msg, r.created
  into v_last_http_status_code, v_last_http_timed_out, v_last_http_error_message, v_last_http_created_at
  from net._http_response r
  where coalesce(r.content, '') like '%"target_match_id"%'
     or coalesce(r.content, '') like '%"due_rules"%'
  order by r.created desc
  limit 1;

  select count(*)::integer
  into v_recent_alert_count
  from public.push_dispatch_events pde
  where pde.feature = 'matches'
    and pde.action = 'HEALTH_ALERT'
    and pde.created_at >= now() - interval '24 hours';

  if v_job_id is null or coalesce(v_job_active, false) = false then
    v_status := 'unhealthy';
    v_messages := array_append(v_messages, '賽事提醒 cron 未啟用');
  elsif v_last_run_status is null then
    v_status := 'warning';
    v_messages := array_append(v_messages, '尚未找到最近一次 cron 執行紀錄');
  elsif v_last_run_status <> 'succeeded' then
    v_status := 'unhealthy';
    v_messages := array_append(v_messages, format('最近一次 cron 執行失敗：%s', coalesce(v_last_run_return_message, v_last_run_status)));
  elsif v_last_run_start_time < now() - interval '5 minutes' then
    v_status := 'warning';
    v_messages := array_append(v_messages, 'cron 最近 5 分鐘內沒有執行紀錄');
  end if;

  if v_last_http_status_code is null then
    if v_status = 'healthy' then
      v_status := 'warning';
    end if;
    v_messages := array_append(v_messages, '尚未找到 send-match-reminders HTTP 回應');
  elsif coalesce(v_last_http_timed_out, false) or coalesce(v_last_http_status_code, 0) >= 400 then
    v_status := 'unhealthy';
    v_messages := array_append(v_messages, format('最近一次 send-match-reminders HTTP 狀態異常：%s', coalesce(v_last_http_status_code::text, v_last_http_error_message, 'unknown')));
  end if;

  if not v_config_enabled then
    if v_status = 'healthy' then
      v_status := 'warning';
    end if;
    v_messages := array_append(v_messages, '賽事提醒排程目前停用');
  end if;

  if v_recent_alert_count > 0 then
    v_status := 'unhealthy';
    v_messages := array_append(v_messages, format('最近 24 小時有 %s 筆健康警報', v_recent_alert_count));
  end if;

  return jsonb_build_object(
    'status', v_status,
    'messages', to_jsonb(v_messages),
    'checked_at', now(),
    'cron', jsonb_build_object(
      'exists', v_job_id is not null,
      'active', coalesce(v_job_active, false),
      'schedule', v_job_schedule,
      'last_status', v_last_run_status,
      'last_return_message', v_last_run_return_message,
      'last_start_time', v_last_run_start_time,
      'last_end_time', v_last_run_end_time
    ),
    'http', jsonb_build_object(
      'last_status_code', v_last_http_status_code,
      'last_timed_out', coalesce(v_last_http_timed_out, false),
      'last_error_message', v_last_http_error_message,
      'last_created_at', v_last_http_created_at
    ),
    'config', jsonb_build_object(
      'enabled', v_config_enabled,
      'rule_count', v_rule_count
    ),
    'recent_alert_count', v_recent_alert_count
  );
end;
$$;

revoke all on function public.get_match_reminder_health_status() from public;
grant execute on function public.get_match_reminder_health_status() to authenticated, service_role;

drop function if exists public.get_notification_feed(integer);
drop function if exists public.get_notification_feed(integer, boolean);

create or replace function public.get_notification_feed(
  p_limit integer default 10,
  p_include_fee_reminders boolean default false
)
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
          when pde.match_id is not null then format('/calendar?match_id=%s', pde.match_id::text)
          else '/calendar'
        end
      ) as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'matches'
      and pde.action = 'REMINDER'
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  match_health_items as (
    select
      pde.event_key as id,
      'match'::text as source,
      coalesce(nullif(pde.title, ''), '賽事提醒排程異常') as title,
      coalesce(nullif(pde.body, ''), '賽事提醒排程需要管理者確認。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/match-records') as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'matches'
      and pde.action = 'HEALTH_ALERT'
      and pde.target_user_id = v_user_id
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
  ),
  training_items as (
    select
      pde.event_key as id,
      'training'::text as source,
      coalesce(nullif(pde.title, ''), '特訓課通知') as title,
      coalesce(nullif(pde.body, ''), '特訓課已開放報名，請查看報名資訊。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/training') as link,
      coalesce((pde.target_member_ids)[1], null::uuid) as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'training'
      and pde.action = 'VIEW'
      and (
        (
          pde.target_user_id is null
          and (
            v_is_admin
            or 'training' = any(v_permissions)
            or exists (
              select 1
              from public.profiles current_profile
              where current_profile.id = v_user_id
                and cardinality(coalesce(current_profile.linked_team_member_ids, array[]::uuid[])) > 0
            )
          )
        )
        or pde.target_user_id = v_user_id
      )
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  training_location_items as (
    select
      pde.event_key as id,
      'training_location'::text as source,
      coalesce(nullif(pde.title, ''), '訓練場地通知') as title,
      coalesce(nullif(pde.body, ''), '請查看本週訓練場地配置。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/dashboard') as link,
      coalesce((pde.target_member_ids)[1], null::uuid) as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'training_locations'
      and pde.action = 'VIEW'
      and pde.target_user_id = v_user_id
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  fee_reminder_snapshot as (
    select public.get_fee_management_reminders() as snapshot
    where p_include_fee_reminders
      and (v_is_admin or 'fees' = any(v_permissions))
  ),
  fee_reminder_items as (
    select
      coalesce(reminder.item->>'id', reminder.item->>'kind') as id,
      case
        when reminder.item->>'kind' in (
          'equipmentPaymentPending',
          'equipmentRequestPending',
          'equipmentRequestInProgress',
          'equipmentUnpaid'
        ) then 'equipment'
        else 'fee'
      end::text as source,
      coalesce(nullif(reminder.item->>'title', ''), '收費待辦提醒') as title,
      coalesce(nullif(reminder.item->>'body', ''), '收費管理有待處理事項。') as body,
      coalesce(nullif(reminder.item->>'created_at', '')::timestamptz, now()) as created_at,
      coalesce(nullif(reminder.item->>'link', ''), '/fees') as link,
      null::uuid as highlight_member_id
    from fee_reminder_snapshot
    cross join lateral jsonb_array_elements(
      coalesce(fee_reminder_snapshot.snapshot->'items', '[]'::jsonb)
    ) as reminder(item)
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
    select * from match_items
    union all
    select * from match_health_items
    union all
    select * from announcement_items
    union all
    select * from training_items
    union all
    select * from training_location_items
    union all
    select * from fee_reminder_items
  ) feed
  order by feed.created_at desc
  limit (select feed_limit from limit_settings);
end;
$$;

revoke all on function public.get_notification_feed(integer, boolean) from public;
grant execute on function public.get_notification_feed(integer, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
