begin;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

insert into public.system_settings (
  key,
  value,
  description,
  updated_at
)
values (
  'training_registration_notification',
  jsonb_build_object(
    'function_url',
      'https://qwxzwomzoyfkorbwsscv.supabase.co/functions/v1/send-training-registration-notifications',
    'authorization',
      'Bearer ' || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3eHp3b216b3lma29yYndzc2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMTgzNTQsImV4cCI6MjA4OTg5NDM1NH0.5miN0hlm7nYrCyuGOKXmRq9Yr0aUtFn7U7tkXzTy40s',
    'sync_secret',
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  ),
  '特訓報名開始/截止提醒 Edge Function 呼叫設定',
  timezone('utc', now())
)
on conflict (key) do update
set
  value = public.system_settings.value || jsonb_build_object(
    'function_url',
      coalesce(
        nullif(public.system_settings.value->>'function_url', ''),
        excluded.value->>'function_url'
      ),
    'authorization',
      coalesce(
        nullif(public.system_settings.value->>'authorization', ''),
        excluded.value->>'authorization'
      ),
    'sync_secret',
      coalesce(
        nullif(public.system_settings.value->>'sync_secret', ''),
        excluded.value->>'sync_secret'
      )
  ),
  description = excluded.description,
  updated_at = timezone('utc', now());

create or replace function public.get_training_registration_notification_diagnostics(
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 20));
  v_settings jsonb;
  v_cron jsonb;
  v_sessions jsonb;
  v_events jsonb;
  v_push_targets jsonb;
  v_config jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not (
    public.has_app_permission('training', 'CREATE')
    or public.has_app_permission('training', 'EDIT')
    or public.has_app_permission('training', 'DELETE')
  ) then
    raise exception 'training management permission required';
  end if;

  select coalesce(ss.value, '{}'::jsonb)
  into v_config
  from public.system_settings ss
  where ss.key = 'training_registration_notification';

  v_settings := jsonb_build_object(
    'function_url_configured',
      true,
    'function_url_source',
      case
        when nullif(current_setting('app.training_registration_notification_function_url', true), '') is not null
          then 'db_setting'
        when nullif(v_config->>'function_url', '') is not null
          then 'system_settings'
        else 'project_default'
      end,
    'authorization_configured',
      coalesce(
        nullif(current_setting('app.training_registration_notification_authorization', true), ''),
        nullif(v_config->>'authorization', '')
      ) is not null,
    'authorization_source',
      case
        when nullif(current_setting('app.training_registration_notification_authorization', true), '') is not null
          then 'db_setting'
        when nullif(v_config->>'authorization', '') is not null
          then 'system_settings'
        else 'missing'
      end,
    'secret_configured',
      coalesce(
        nullif(current_setting('app.training_registration_notification_secret', true), ''),
        nullif(v_config->>'sync_secret', '')
      ) is not null,
    'secret_source',
      case
        when nullif(current_setting('app.training_registration_notification_secret', true), '') is not null
          then 'db_setting'
        when nullif(v_config->>'sync_secret', '') is not null
          then 'system_settings'
        else 'missing'
      end
  );

  with jobs as (
    select
      j.jobid,
      j.jobname,
      j.schedule,
      j.active,
      left(coalesce(j.command, ''), 500) as command_preview
    from cron.job j
    where j.jobname = 'training-registration-notification-checker'
    order by j.jobid
  ),
  runs as (
    select
      jrd.runid,
      jrd.jobid,
      jrd.status,
      left(coalesce(jrd.return_message, ''), 800) as return_message,
      jrd.start_time,
      jrd.end_time
    from cron.job j
    join cron.job_run_details jrd
      on jrd.jobid = j.jobid
    where j.jobname = 'training-registration-notification-checker'
    order by jrd.start_time desc
    limit 10
  )
  select jsonb_build_object(
    'job_exists', exists (select 1 from jobs),
    'jobs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'jobid', jobid,
            'jobname', jobname,
            'schedule', schedule,
            'active', active,
            'command_preview', command_preview
          )
          order by jobid
        )
        from jobs
      ),
      '[]'::jsonb
    ),
    'recent_runs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'runid', runid,
            'jobid', jobid,
            'status', status,
            'return_message', return_message,
            'start_time', start_time,
            'end_time', end_time
          )
          order by start_time desc
        )
        from runs
      ),
      '[]'::jsonb
    )
  )
  into v_cron;

  with recent_sessions as (
    select
      tss.id as session_id,
      tss.match_id,
      tss.manual_status,
      tss.registration_start_at,
      tss.registration_end_at,
      tss.capacity,
      coalesce(tss.point_cost, 1) as point_cost,
      m.match_name,
      m.match_date,
      m.match_time,
      m.location,
      m.match_level,
      coalesce(reg_counts.selected_count, 0) as selected_count
    from public.training_session_settings tss
    join public.matches m
      on m.id = tss.match_id
    left join lateral (
      select count(*)::integer as selected_count
      from public.training_registrations tr
      where tr.session_id = tss.id
        and tr.status = 'selected'
    ) reg_counts on true
    order by
      tss.registration_start_at desc nulls last,
      m.match_date desc nulls last,
      tss.created_at desc
    limit v_limit
  ),
  session_diagnostics as (
    select
      rs.*,
      array_remove(array[
        case when rs.match_level <> '特訓課' then 'not_training_match' end,
        case when rs.manual_status <> 'open' then 'manual_status_not_open' end,
        case when rs.registration_start_at is null then 'registration_start_missing' end,
        case when rs.registration_start_at is not null and rs.registration_start_at > now() then 'registration_start_future' end,
        case when rs.registration_end_at is not null and rs.registration_end_at < now() then 'registration_end_expired' end
      ], null) as blockers,
      pde.event_key as event_key,
      pde.created_at as event_created_at
    from recent_sessions rs
    left join lateral (
      select
        pde.event_key,
        pde.created_at
      from public.push_dispatch_events pde
      where pde.feature = 'training'
        and pde.action = 'VIEW'
        and pde.event_key like ('training_registration_open:' || rs.session_id::text || ':%')
      order by pde.created_at desc
      limit 1
    ) pde on true
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'session_id', session_id,
      'match_id', match_id,
      'match_name', match_name,
      'match_date', match_date,
      'match_time', match_time,
      'location', location,
      'match_level', match_level,
      'manual_status', manual_status,
      'registration_start_at', registration_start_at,
      'registration_end_at', registration_end_at,
      'capacity', capacity,
      'point_cost', point_cost,
      'selected_count', selected_count,
      'open_event_key_prefix', 'training_registration_open:' || session_id::text || ':',
      'open_event_exists', event_key is not null,
      'open_event_key', event_key,
      'open_event_created_at', event_created_at,
      'blockers', to_jsonb(blockers),
      'trigger_state', case
        when event_key is not null then 'duplicate'
        when cardinality(blockers) = 0 then 'ready'
        else 'blocked'
      end
    )
    order by registration_start_at desc nulls last, match_date desc nulls last
  ), '[]'::jsonb)
  into v_sessions
  from session_diagnostics;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'event_key', event_key,
      'title', title,
      'body', body,
      'url', url,
      'match_id', match_id,
      'created_at', created_at
    )
    order by created_at desc
  ), '[]'::jsonb)
  into v_events
  from (
    select
      pde.event_key,
      pde.title,
      pde.body,
      pde.url,
      pde.match_id,
      pde.created_at
    from public.push_dispatch_events pde
    where pde.feature = 'training'
      and pde.action = 'VIEW'
      and (
        pde.event_key like 'training_registration_open:%'
        or pde.event_key like 'training_registration_deadline:%'
      )
    order by pde.created_at desc
    limit 10
  ) recent_events;

  with permission_roles as (
    select distinct arp.role_key
    from public.app_role_permissions arp
    where arp.feature = 'training'
      and arp.action in ('VIEW', 'CREATE', 'EDIT', 'DELETE')
    union
    select 'ADMIN'::text
  ),
  eligible_members as (
    select tm.id
    from public.team_members_safe tm
    where tm.role in ('球員', '校隊')
      and coalesce(tm.status, '') <> '退隊'
  ),
  target_users as (
    select distinct p.id
    from public.profiles p
    where coalesce(p.is_active, true)
      and (p.access_start is null or p.access_start <= now())
      and (p.access_end is null or p.access_end >= now())
      and (
        p.role in (select role_key from permission_roles)
        or exists (
          select 1
          from unnest(coalesce(p.linked_team_member_ids, array[]::uuid[])) linked(member_id)
          join eligible_members em
            on em.id = linked.member_id
        )
      )
  )
  select jsonb_build_object(
    'active_training_users', coalesce((select count(*) from target_users), 0),
    'enabled_subscriptions', coalesce((
      select count(*)
      from public.web_push_subscriptions wps
      join target_users tu
        on tu.id = wps.user_id
      where wps.enabled = true
    ), 0)
  )
  into v_push_targets;

  return jsonb_build_object(
    'generated_at', timezone('utc', now()),
    'settings', v_settings,
    'cron', v_cron,
    'recent_sessions', coalesce(v_sessions, '[]'::jsonb),
    'recent_events', coalesce(v_events, '[]'::jsonb),
    'push_targets', coalesce(v_push_targets, jsonb_build_object(
      'active_training_users', 0,
      'enabled_subscriptions', 0
    ))
  );
end;
$$;

revoke all on function public.get_training_registration_notification_diagnostics(integer) from public;
grant execute on function public.get_training_registration_notification_diagnostics(integer) to authenticated, service_role;

create or replace function public.invoke_training_registration_notification_once(
  p_dry_run boolean default false,
  p_limit integer default 20,
  p_now timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_config jsonb := '{}'::jsonb;
  v_url text;
  v_authorization text;
  v_secret text;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_request_id bigint;
  v_queued_at timestamptz := timezone('utc', now());
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.has_app_permission('training', 'EDIT') then
    raise exception 'training:EDIT permission required';
  end if;

  select coalesce(ss.value, '{}'::jsonb)
  into v_config
  from public.system_settings ss
  where ss.key = 'training_registration_notification';

  v_url := coalesce(
    nullif(current_setting('app.training_registration_notification_function_url', true), ''),
    nullif(v_config->>'function_url', ''),
    'https://qwxzwomzoyfkorbwsscv.supabase.co/functions/v1/send-training-registration-notifications'
  );
  v_authorization := coalesce(
    nullif(current_setting('app.training_registration_notification_authorization', true), ''),
    nullif(v_config->>'authorization', '')
  );
  v_secret := coalesce(
    nullif(current_setting('app.training_registration_notification_secret', true), ''),
    nullif(v_config->>'sync_secret', '')
  );

  if v_url is null then
    raise exception 'app.training_registration_notification_function_url is not set';
  end if;

  if v_authorization is null then
    raise exception 'app.training_registration_notification_authorization is not set';
  end if;

  if v_secret is null then
    raise exception 'app.training_registration_notification_secret is not set';
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', v_authorization,
      'x-sync-secret', v_secret
    )),
    body := jsonb_build_object(
      'source', 'manual_rpc',
      'triggered_by', v_user_id,
      'dry_run', coalesce(p_dry_run, false),
      'force_resend', not coalesce(p_dry_run, false),
      'limit', v_limit,
      'now', coalesce(p_now, now()),
      'checks', 'registration_open_and_deadline_reminder'
    ),
    timeout_milliseconds := 60000
  )
  into v_request_id;

  return jsonb_build_object(
    'queued', true,
    'request_id', v_request_id,
    'dry_run', coalesce(p_dry_run, false),
    'limit', v_limit,
    'queued_at', v_queued_at
  );
end;
$$;

revoke all on function public.invoke_training_registration_notification_once(boolean, integer, timestamptz) from public;
grant execute on function public.invoke_training_registration_notification_once(boolean, integer, timestamptz) to authenticated, service_role;

create or replace function public.has_due_training_registration_notifications(
  p_now timestamptz default now()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with eligible_sessions as (
    select
      tss.id as session_id,
      tss.registration_start_at,
      tss.registration_end_at,
      tss.capacity,
      coalesce(selected_counts.selected_count, 0) as selected_count
    from public.training_session_settings tss
    join public.matches m
      on m.id = tss.match_id
    left join lateral (
      select count(*)::integer as selected_count
      from public.training_registrations tr
      where tr.session_id = tss.id
        and tr.status = 'selected'
    ) selected_counts on true
    where m.match_level = '特訓課'
      and tss.manual_status = 'open'
      and tss.registration_start_at is not null
      and tss.registration_start_at <= p_now
      and (
        tss.registration_end_at is null
        or tss.registration_end_at >= p_now
      )
  ),
  due_open as (
    select 1
    from eligible_sessions es
    where not exists (
      select 1
      from public.push_dispatch_events pde
      where pde.feature = 'training'
        and pde.action = 'VIEW'
        and pde.event_key = (
          'training_registration_open:'
          || es.session_id::text
          || ':'
          || (to_jsonb(es.registration_start_at)#>>'{}')
        )
    )
  ),
  due_deadline as (
    select 1
    from eligible_sessions es
    where es.registration_end_at is not null
      and es.registration_end_at > p_now
      and es.registration_end_at - p_now <= interval '24 hours'
      and (
        coalesce(es.capacity, 0) <= 0
        or es.selected_count < es.capacity
      )
      and not exists (
        select 1
        from public.push_dispatch_events pde
        where pde.feature = 'training'
          and pde.action = 'VIEW'
          and pde.event_key = (
            'training_registration_deadline:'
            || es.session_id::text
            || ':'
            || (to_jsonb(es.registration_end_at)#>>'{}')
          )
      )
  )
  select exists (
    select 1 from due_open
    union all
    select 1 from due_deadline
  );
$$;

revoke all on function public.has_due_training_registration_notifications(timestamptz) from public;
grant execute on function public.has_due_training_registration_notifications(timestamptz) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'training-registration-notification-checker';

select cron.schedule(
  'training-registration-notification-checker',
  '*/5 * * * *',
  $$
  do $cron$
  declare
    v_config jsonb := '{}'::jsonb;
    v_url text;
    v_authorization text;
    v_secret text;
  begin
    if not public.has_due_training_registration_notifications(now()) then
      return;
    end if;

    select coalesce(ss.value, '{}'::jsonb)
    into v_config
    from public.system_settings ss
    where ss.key = 'training_registration_notification';

    v_url := coalesce(
      nullif(current_setting('app.training_registration_notification_function_url', true), ''),
      nullif(v_config->>'function_url', ''),
      'https://qwxzwomzoyfkorbwsscv.supabase.co/functions/v1/send-training-registration-notifications'
    );
    v_authorization := coalesce(
      nullif(current_setting('app.training_registration_notification_authorization', true), ''),
      nullif(v_config->>'authorization', '')
    );
    v_secret := coalesce(
      nullif(current_setting('app.training_registration_notification_secret', true), ''),
      nullif(v_config->>'sync_secret', '')
    );

    if v_url is null or v_authorization is null or v_secret is null then
      raise notice 'training registration notification settings are incomplete; skip';
      return;
    end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_strip_nulls(jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', v_authorization,
        'x-sync-secret', v_secret
      )),
      body := jsonb_build_object(
        'source', 'pg_cron',
        'schedule', 'every 5 minutes',
        'force_resend', false,
        'checks', 'registration_open_and_deadline_reminder'
      ),
      timeout_milliseconds := 60000
    );
  end;
  $cron$;
  $$
);

notify pgrst, 'reload schema';

commit;
