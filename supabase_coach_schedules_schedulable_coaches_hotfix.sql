begin;

create or replace function public.list_schedulable_coaches()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_coach_schedules_permission('VIEW');

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'nickname', p.nickname,
          'role', p.role,
          'avatar_url', p.avatar_url
        )
        order by
          case upper(btrim(coalesce(p.role, '')))
            when 'HEAD_COACH' then 0
            when 'COACH' then 1
            else 9
          end,
          coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.name), ''), p.email)
      )
      from public.profiles p
      where (
          upper(btrim(coalesce(p.role, ''))) in ('HEAD_COACH', 'COACH')
          or btrim(coalesce(p.role, '')) in ('總教練', '教練')
        )
        and coalesce(p.is_active, true)
        and (p.access_start is null or p.access_start <= now())
        and (p.access_end is null or p.access_end >= now())
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_schedulable_coaches() from public;
revoke all on function public.list_schedulable_coaches() from anon;
grant execute on function public.list_schedulable_coaches() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
