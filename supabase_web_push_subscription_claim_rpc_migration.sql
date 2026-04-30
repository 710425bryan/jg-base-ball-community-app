begin;

create or replace function public.upsert_my_web_push_subscription(
  p_endpoint text,
  p_subscription jsonb,
  p_platform text default null,
  p_user_agent text default null,
  p_enabled boolean default true
)
returns table (
  id uuid,
  endpoint text,
  enabled boolean,
  platform text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_endpoint text := nullif(btrim(coalesce(p_endpoint, '')), '');
  v_subscription_endpoint text := nullif(btrim(coalesce(p_subscription ->> 'endpoint', '')), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_endpoint is null then
    raise exception 'Endpoint is required';
  end if;

  if p_subscription is null or jsonb_typeof(p_subscription) <> 'object' then
    raise exception 'Subscription is required';
  end if;

  if v_subscription_endpoint is not null and v_subscription_endpoint <> v_endpoint then
    raise exception 'Subscription endpoint mismatch';
  end if;

  return query
  insert into public.web_push_subscriptions (
    user_id,
    endpoint,
    subscription,
    platform,
    user_agent,
    enabled
  )
  values (
    v_user_id,
    v_endpoint,
    p_subscription,
    nullif(btrim(coalesce(p_platform, '')), ''),
    nullif(btrim(coalesce(p_user_agent, '')), ''),
    coalesce(p_enabled, true)
  )
  on conflict (endpoint) do update
  set
    user_id = excluded.user_id,
    subscription = excluded.subscription,
    platform = excluded.platform,
    user_agent = excluded.user_agent,
    enabled = excluded.enabled,
    updated_at = timezone('utc', now())
  returning
    web_push_subscriptions.id,
    web_push_subscriptions.endpoint,
    web_push_subscriptions.enabled,
    web_push_subscriptions.platform;
end;
$$;

revoke all on function public.upsert_my_web_push_subscription(text, jsonb, text, text, boolean) from public;
grant execute on function public.upsert_my_web_push_subscription(text, jsonb, text, text, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
