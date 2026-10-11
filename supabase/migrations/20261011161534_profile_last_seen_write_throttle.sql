begin;

-- Keep the existing auth.uid()-only identity and void response, but enforce the
-- frontend's five-minute write interval across tabs/devices on the server too.
-- PostgreSQL rechecks the UPDATE predicate after a concurrent updater commits.
create or replace function public.touch_profile_last_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  update public.profiles
  set last_seen_at = now()
  where id = v_user_id
    and (last_seen_at is null or last_seen_at <= now() - interval '5 minutes');
end;
$$;

-- Match the live ACL verified 2026-10-09; no caller can supply another user ID.
revoke all on function public.touch_profile_last_seen() from public, anon, authenticated, service_role;
grant execute on function public.touch_profile_last_seen() to authenticated, service_role;

commit;
