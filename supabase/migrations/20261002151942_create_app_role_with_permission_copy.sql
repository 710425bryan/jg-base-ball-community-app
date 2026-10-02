begin;

-- Keep the existing ADMIN-only table RLS and run with the caller's privileges.
-- A single RPC makes role creation and the permission snapshot atomic.
create or replace function public.create_app_role(
  p_role_key text,
  p_role_name text,
  p_copy_from_role_key text default null
)
returns public.app_roles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role_key text := btrim(coalesce(p_role_key, ''));
  v_role_name text := btrim(coalesce(p_role_name, ''));
  v_copy_from_role_key text := nullif(btrim(coalesce(p_copy_from_role_key, '')), '');
  v_role public.app_roles;
begin
  if auth.uid() is null or public.current_profile_role() is distinct from 'ADMIN' then
    raise exception '只有有效管理員可以新增角色'
      using errcode = '42501';
  end if;

  if v_role_key = '' or v_role_key !~ '^[A-Z_]+$' then
    raise exception '角色識別碼僅限大寫英文字母與底線'
      using errcode = '22023';
  end if;

  if v_role_name = '' then
    raise exception '請輸入角色顯示名稱'
      using errcode = '22023';
  end if;

  if v_copy_from_role_key = 'ADMIN' then
    -- ADMIN is a global bypass, not an ordinary saved permission set.
    raise exception '管理員最高權限無法複製，請選擇其他角色'
      using errcode = '22023';
  end if;

  if v_copy_from_role_key is not null then
    -- Prevent the source role from being deleted/renamed while it is copied.
    perform 1
    from public.app_roles
    where role_key = v_copy_from_role_key
    for key share;

    if not found then
      raise exception '要複製的來源角色不存在，請重新選擇'
        using errcode = '22023';
    end if;
  end if;

  insert into public.app_roles (role_key, role_name, is_system)
  values (v_role_key, v_role_name, false)
  returning * into v_role;

  if v_copy_from_role_key is not null then
    insert into public.app_role_permissions (role_key, feature, action)
    select v_role_key, source.feature, source.action
    from public.app_role_permissions source
    where source.role_key = v_copy_from_role_key;
  end if;

  return v_role;
end;
$$;

comment on function public.create_app_role(text, text, text) is
  '有效 ADMIN 原子新增客製化角色，可選擇複製非 ADMIN 來源角色的目前權限快照；不複製系統角色屬性或 ADMIN bypass。';

revoke all on function public.create_app_role(text, text, text) from public, anon;
grant execute on function public.create_app_role(text, text, text) to authenticated;

commit;
