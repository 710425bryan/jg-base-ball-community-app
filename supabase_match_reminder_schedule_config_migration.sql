begin;

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.system_settings enable row level security;

insert into public.system_settings (key, value, description)
values (
  'match_reminder_schedule_config',
  jsonb_build_object(
    'version', 1,
    'enabled', true,
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'default-1-day-2000',
        'days_before', 1,
        'time', '20:00',
        'enabled', true
      )
    )
  ),
  '比賽提醒排程設定'
)
on conflict (key) do nothing;

create or replace function public.get_match_reminder_schedule_config()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_default jsonb := jsonb_build_object(
    'version', 1,
    'enabled', true,
    'rules', jsonb_build_array(
      jsonb_build_object(
        'id', 'default-1-day-2000',
        'days_before', 1,
        'time', '20:00',
        'enabled', true
      )
    )
  );
  v_config jsonb;
begin
  if not public.has_app_permission('matches', 'EDIT') then
    raise exception 'permission denied for match reminder schedule';
  end if;

  select ss.value
  into v_config
  from public.system_settings ss
  where ss.key = 'match_reminder_schedule_config';

  return coalesce(v_config, v_default);
end;
$$;

create or replace function public.save_match_reminder_schedule_config(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb := coalesce(p_config, '{}'::jsonb);
  v_rules jsonb;
  v_rule jsonb;
  v_index integer;
  v_rule_count integer;
  v_enabled boolean;
  v_rule_enabled boolean;
  v_rule_id text;
  v_days numeric;
  v_days_before integer;
  v_time text;
  v_rule_key text;
  v_seen_rule_keys text[] := '{}'::text[];
  v_normalized_rules jsonb := '[]'::jsonb;
  v_normalized_config jsonb;
begin
  if not public.has_app_permission('matches', 'EDIT') then
    raise exception 'permission denied for match reminder schedule';
  end if;

  if jsonb_typeof(v_config) <> 'object' then
    raise exception 'match reminder schedule config must be an object';
  end if;

  if v_config ? 'enabled' and jsonb_typeof(v_config->'enabled') <> 'boolean' then
    raise exception 'match reminder schedule enabled must be boolean';
  end if;

  v_enabled := coalesce((v_config->>'enabled')::boolean, true);
  v_rules := coalesce(v_config->'rules', '[]'::jsonb);

  if jsonb_typeof(v_rules) <> 'array' then
    raise exception 'match reminder schedule rules must be an array';
  end if;

  v_rule_count := jsonb_array_length(v_rules);
  if v_rule_count = 0 then
    raise exception 'match reminder schedule requires at least one rule';
  end if;

  if v_rule_count > 10 then
    raise exception 'match reminder schedule can contain at most 10 rules';
  end if;

  for v_rule, v_index in
    select item.value, item.ordinality::integer
    from jsonb_array_elements(v_rules) with ordinality as item(value, ordinality)
  loop
    if jsonb_typeof(v_rule) <> 'object' then
      raise exception 'match reminder schedule rule % must be an object', v_index;
    end if;

    if not (v_rule ? 'days_before') or jsonb_typeof(v_rule->'days_before') <> 'number' then
      raise exception 'match reminder schedule rule % days_before must be a number', v_index;
    end if;

    v_days := (v_rule->>'days_before')::numeric;
    if v_days <> trunc(v_days) or v_days < 0 or v_days > 30 then
      raise exception 'match reminder schedule rule % days_before must be an integer from 0 to 30', v_index;
    end if;
    v_days_before := v_days::integer;

    v_time := btrim(coalesce(v_rule->>'time', ''));
    if v_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'match reminder schedule rule % time must be HH:mm', v_index;
    end if;

    if v_rule ? 'enabled' and jsonb_typeof(v_rule->'enabled') <> 'boolean' then
      raise exception 'match reminder schedule rule % enabled must be boolean', v_index;
    end if;
    v_rule_enabled := coalesce((v_rule->>'enabled')::boolean, true);

    v_rule_key := format('%s:%s', v_days_before, v_time);
    if v_rule_key = any(v_seen_rule_keys) then
      raise exception 'match reminder schedule rule % duplicates another days/time pair', v_index;
    end if;
    v_seen_rule_keys := array_append(v_seen_rule_keys, v_rule_key);

    v_rule_id := btrim(coalesce(v_rule->>'id', ''));
    if v_rule_id = '' then
      v_rule_id := format('rule-%s-%s-%s', v_days_before, replace(v_time, ':', ''), v_index);
    end if;

    v_normalized_rules := v_normalized_rules || jsonb_build_array(
      jsonb_build_object(
        'id', v_rule_id,
        'days_before', v_days_before,
        'time', v_time,
        'enabled', v_rule_enabled
      )
    );
  end loop;

  v_normalized_config := jsonb_build_object(
    'version', 1,
    'enabled', v_enabled,
    'rules', v_normalized_rules
  );

  insert into public.system_settings (key, value, description, updated_at)
  values (
    'match_reminder_schedule_config',
    v_normalized_config,
    '比賽提醒排程設定',
    timezone('utc', now())
  )
  on conflict (key) do update
    set value = excluded.value,
        description = excluded.description,
        updated_at = timezone('utc', now());

  return v_normalized_config;
end;
$$;

revoke all on function public.get_match_reminder_schedule_config() from public;
grant execute on function public.get_match_reminder_schedule_config() to authenticated, service_role;

revoke all on function public.save_match_reminder_schedule_config(jsonb) from public;
grant execute on function public.save_match_reminder_schedule_config(jsonb) to authenticated, service_role;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Required DB settings before the cron job runs:
-- alter database postgres set app.match_reminder_function_url = 'https://<project-ref>.supabase.co/functions/v1/send-match-reminders';
-- alter database postgres set app.match_reminder_authorization = 'Bearer <anon-or-service-role-jwt>';
-- alter database postgres set app.match_reminder_secret = '<same value as MATCH_REMINDER_SECRET>';

select cron.unschedule(jobid)
from cron.job
where jobname in ('match-reminder-daily', 'match-reminder-checker');

select cron.schedule(
  'match-reminder-checker',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.match_reminder_function_url', true),
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', current_setting('app.match_reminder_authorization', true),
      'x-sync-secret', nullif(current_setting('app.match_reminder_secret', true), '')
    )),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'schedule', 'every minute Asia/Taipei',
      'mode', 'auto'
    ),
    timeout_milliseconds := 60000
  ) as request_id
  where nullif(current_setting('app.match_reminder_function_url', true), '') is not null;
  $$
);

notify pgrst, 'reload schema';

commit;
