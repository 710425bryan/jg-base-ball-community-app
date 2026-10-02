begin;

-- Seed the requested display order once for these exact existing role keys.
-- Other roles, role metadata and all saved permissions remain unchanged.
update public.app_roles roles
set weight = defaults.weight
from (values
  ('ADMIN', 1),
  ('MANAGER', 9),
  ('HEAD_COACH', 10),
  ('SCHEDULINGCOACH', 15),
  ('COACH', 16),
  ('FINANCE', 20),
  ('COMMITTEE', 21),
  ('MEMBER', 99)
) as defaults(role_key, weight)
where roles.role_key = defaults.role_key
  and roles.weight is distinct from defaults.weight;

-- weight controls display order only. It never determines authorization.
create or replace function public.update_app_role_weight(
  p_role_key text,
  p_weight integer
)
returns public.app_roles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_role public.app_roles;
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'ADMIN' then
    raise exception '只有有效管理員可以調整角色排序'
      using errcode = '42501';
  end if;

  if v_role_key = '' then
    raise exception '請指定要調整排序的角色'
      using errcode = '22023';
  end if;

  if p_weight is null or p_weight <= 0 then
    raise exception '角色排序數字必須為正整數'
      using errcode = '22023';
  end if;

  update public.app_roles
  set weight = p_weight
  where role_key = v_role_key
  returning * into v_role;

  if not found then
    raise exception '找不到角色，請重新整理後再試'
      using errcode = '22023';
  end if;

  return v_role;
end;
$$;

comment on function public.update_app_role_weight(text, integer) is
  '有效 ADMIN 調整任何既有角色的顯示排序正整數，包含 ADMIN 與自訂角色；使用原 RLS，不改角色屬性或授權。';

revoke all on function public.update_app_role_weight(text, integer) from public, anon;
grant execute on function public.update_app_role_weight(text, integer) to authenticated;

commit;
