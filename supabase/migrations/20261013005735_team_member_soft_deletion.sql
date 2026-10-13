begin;

-- Keep the original row and every financial/history reference. The deletion
-- marker is independent of ordinary retirement and must be filtered from ALL
-- roster tabs, including retired members. No existing row is changed here.
alter table public.team_members
  add column deleted_at timestamptz,
  add column deleted_by uuid,
  add column deleted_previous_status text;

comment on column public.team_members.deleted_at is
  '軟刪除時間；所有隊職員名單（含退隊／全部）排除，資料與歷史關聯保留供授權查找。';
comment on column public.team_members.deleted_by is
  '軟刪除操作者 auth.uid 快照；保留 UUID，不因帳號刪除清除稽核。';
comment on column public.team_members.deleted_previous_status is
  '軟刪除前的在隊狀態；刪除時將 status 設為退隊以沿用既有有效成員排除規則。';

create schema if not exists private;

-- This trigger is deliberately SECURITY INVOKER: an authenticated raw request
-- cannot forge/clear deletion metadata or resurrect a saved, deleted member.
-- The permission-checked definer RPC below runs as its owner. Maintenance roles
-- retain explicit database repair access; no new client grants are introduced.
create or replace function private.guard_team_member_soft_deletion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then
      raise exception using errcode = '42501',
        message = '隊職員資料須保留，請重新整理頁面後使用軟刪除操作。';
    elsif tg_op = 'INSERT' then
      if new.deleted_at is not null or new.deleted_by is not null
        or new.deleted_previous_status is not null then
        raise exception using errcode = '42501', message = '不可直接設定隊職員刪除標記。';
      end if;
    else
      if old.deleted_at is not null then
        raise exception using errcode = '42501',
          message = '此隊職員已刪除，歷史資料已保留，不能由名單編輯或同步覆寫。';
      end if;
      if new.deleted_at is distinct from old.deleted_at
        or new.deleted_by is distinct from old.deleted_by
        or new.deleted_previous_status is distinct from old.deleted_previous_status then
        raise exception using errcode = '42501', message = '請使用隊職員軟刪除操作。';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.guard_team_member_soft_deletion() from public, anon, authenticated;
create trigger guard_team_member_soft_deletion
  before insert or update or delete on public.team_members
  for each row execute function private.guard_team_member_soft_deletion();

create or replace function public.soft_delete_team_member(p_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.team_members%rowtype;
begin
  if auth.uid() is null or not coalesce(public.has_app_permission('players', 'DELETE'), false) then
    raise exception using errcode = '42501', message = '需要有效帳號及隊職員刪除權限。';
  end if;
  select tm.* into v_member
  from public.team_members tm
  where tm.id = p_member_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = '找不到此隊職員，請重新整理名單。';
  end if;
  -- Retried requests retain the first deletion timestamp, actor and old status.
  if v_member.deleted_at is not null then return v_member.id; end if;

  update public.team_members
  set deleted_at = now(), deleted_by = auth.uid(),
      deleted_previous_status = v_member.status, status = '退隊', updated_at = now()
  where id = v_member.id;
  return v_member.id;
end;
$$;
revoke all on function public.soft_delete_team_member(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_team_member(uuid) to authenticated;

-- Preserve every safe column, existing RLS and historical joins. Filtering the
-- shared view itself would make financial history lose its member labels.
do $$
declare v_definition text;
begin
  v_definition := rtrim(pg_get_viewdef('public.team_members_safe'::regclass, true), E'; \n\r');
  execute 'create or replace view public.team_members_safe with (security_invoker = true) as '
    || 'select existing.*, deletion.deleted_at from (' || v_definition
    || ') existing join public.team_members deletion on deletion.id = existing.id';
end;
$$;
grant select (deleted_at) on public.team_members to authenticated;

notify pgrst, 'reload schema';
commit;
