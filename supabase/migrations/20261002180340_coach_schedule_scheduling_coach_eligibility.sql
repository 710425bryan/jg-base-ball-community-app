-- Add the verified stable custom role key; role display names and VIEW alone
-- never make arbitrary managers, admins or parents assignable as coaches.
begin;
do $$
begin
  if to_regprocedure('private.coach_profile_is_schedulable(uuid)') is null
    or to_regprocedure('private.can_receive_coach_leave_notification(uuid)') is null then
    raise exception using errcode='55000',message='請先完整套用教練請假核心與通知 migration。';
  end if;
end;
$$;
create or replace function private.coach_profile_is_schedulable(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = p_profile_id
    and (p.role = 'SCHEDULINGCOACH' or upper(btrim(p.role)) in ('HEAD_COACH', 'COACH') or btrim(p.role) in ('總教練', '教練'))
    and coalesce(p.is_active, true)
    and (p.access_start is null or p.access_start <= now())
    and (p.access_end is null or p.access_end >= now()));
$$;

create or replace function private.can_receive_coach_leave_notification(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id and coalesce(p.is_active, true)
      and (p.access_start is null or p.access_start <= now())
      and (p.access_end is null or p.access_end >= now())
      and (btrim(p.role) = 'ADMIN' or exists (
        select 1 from public.app_role_permissions a
        where a.role_key = btrim(p.role) and a.action = 'VIEW'
          and (a.feature = 'coach_leave_requests' or (
            a.feature = 'coach_schedules'
            and private.coach_profile_is_schedulable(p.id)
          ))
      ))
  );
$$;
-- CREATE OR REPLACE preserves the existing owner and ACL. Keep both helpers private.
revoke all on function private.coach_profile_is_schedulable(uuid),
  private.can_receive_coach_leave_notification(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
