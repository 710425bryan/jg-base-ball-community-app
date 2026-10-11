begin;

-- A role's display name is presentation metadata. Authorization continues to
-- use the existing role_key, profiles.role and app_role_permissions rows.
create or replace function public.update_app_role_name(
  p_role_key text,
  p_role_name text
)
returns public.app_roles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_role_name text := btrim(coalesce(p_role_name, ''));
  v_role public.app_roles;
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'ADMIN' then
    raise exception '只有有效管理員可以修改角色顯示名稱'
      using errcode = '42501';
  end if;

  if v_role_key = '' then
    raise exception '請指定要修改顯示名稱的角色'
      using errcode = '22023';
  end if;

  if v_role_name = '' or v_role_name ~ '^[[:space:]]*$' then
    raise exception '請輸入角色顯示名稱'
      using errcode = '22023';
  end if;

  if char_length(v_role_name) > 100 then
    raise exception '角色顯示名稱不可超過 100 字'
      using errcode = '22023';
  end if;

  update public.app_roles
  set role_name = v_role_name
  where role_key = v_role_key
  returning * into v_role;

  if not found then
    raise exception '找不到角色，請重新整理後再試'
      using errcode = '22023';
  end if;

  return v_role;
end;
$$;

comment on function public.update_app_role_name(text, text) is
  '有效 ADMIN 修改任何既有角色的顯示名稱，包含 ADMIN 與系統角色；名稱必填且最多 100 字，使用原 RLS，只改 role_name，不改識別碼、排序或授權。';

revoke all on function public.update_app_role_name(text, text) from public, anon;
grant execute on function public.update_app_role_name(text, text) to authenticated;

commit;
