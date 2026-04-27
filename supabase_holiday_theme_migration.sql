begin;

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.system_settings enable row level security;

alter table public.push_dispatch_events
  add column if not exists body text;

insert into public.system_settings (key, value, description)
values (
  'holiday_theme_config',
  jsonb_build_object(
    'version', 2,
    'activities', jsonb_build_array()
  ),
  '首頁節日主題多活動設定'
)
on conflict (key) do nothing;

insert into public.app_role_permissions (role_key, feature, action)
select role_key, 'holiday_theme', 'VIEW'
from public.app_roles
on conflict (role_key, feature, action) do nothing;

insert into public.app_role_permissions (role_key, feature, action)
values
  ('ADMIN', 'holiday_theme_settings', 'VIEW'),
  ('ADMIN', 'holiday_theme_settings', 'EDIT')
on conflict (role_key, feature, action) do nothing;

create or replace function public.get_public_holiday_theme_config()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select ss.value
      from public.system_settings ss
      where ss.key = 'holiday_theme_config'
      limit 1
    ),
    jsonb_build_object('version', 2, 'activities', jsonb_build_array())
  );
$$;

create or replace function public.save_holiday_theme_config(p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb := coalesce(p_config, jsonb_build_object('version', 2, 'activities', jsonb_build_array()));
begin
  if not public.has_app_permission('holiday_theme_settings', 'EDIT') then
    raise exception 'permission denied for holiday theme settings';
  end if;

  insert into public.system_settings (key, value, description, updated_at)
  values (
    'holiday_theme_config',
    v_config,
    '首頁節日主題多活動設定',
    timezone('utc', now())
  )
  on conflict (key) do update
    set value = excluded.value,
        description = excluded.description,
        updated_at = timezone('utc', now());

  return v_config;
end;
$$;

create or replace function public.get_holiday_theme_player_options()
returns table (
  id uuid,
  name text,
  role text,
  team_group text,
  status text,
  avatar_url text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    tm.id,
    tm.name,
    tm.role,
    tm.team_group,
    tm.status,
    tm.avatar_url
  from public.team_members_safe tm
  where public.has_app_permission('holiday_theme_settings', 'VIEW')
    and coalesce(tm.status, '') not in ('離隊', '退隊')
    and tm.role in ('球員', '校隊')
  order by tm.name;
$$;

revoke all on function public.get_public_holiday_theme_config() from public;
grant execute on function public.get_public_holiday_theme_config() to anon, authenticated, service_role;

revoke all on function public.save_holiday_theme_config(jsonb) from public;
grant execute on function public.save_holiday_theme_config(jsonb) to authenticated, service_role;

revoke all on function public.get_holiday_theme_player_options() from public;
grant execute on function public.get_holiday_theme_player_options() to authenticated, service_role;

-- Required DB settings before the cron job sends requests:
-- alter database postgres set app.holiday_theme_function_url = 'https://<project-ref>.supabase.co/functions/v1/notify-holiday-theme';
-- alter database postgres set app.holiday_theme_authorization = 'Bearer <anon-or-service-role-jwt>';
-- alter database postgres set app.holiday_theme_secret = '<same value as HOLIDAY_THEME_SECRET>';

select cron.unschedule(jobid)
from cron.job
where jobname = 'holiday-theme-notification-checker';

select cron.schedule(
  'holiday-theme-notification-checker',
  '* * * * *',
  $$
  select net.http_post(
    url := current_setting('app.holiday_theme_function_url', true),
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', current_setting('app.holiday_theme_authorization', true),
      'x-sync-secret', nullif(current_setting('app.holiday_theme_secret', true), '')
    )),
    body := jsonb_build_object(
      'source', 'pg_cron',
      'mode', 'auto'
    ),
    timeout_milliseconds := 60000
  ) as request_id
  where nullif(current_setting('app.holiday_theme_function_url', true), '') is not null;
  $$
);

notify pgrst, 'reload schema';

commit;
