begin;

-- Custom labels describe community players; role remains the business authority.
alter table public.team_members add column member_identity_label text;
comment on column public.team_members.member_identity_label is
  'Custom community-player identity label. Does not replace role, training_program or fee_billing_mode.';

create table public.player_identity_labels (
  name text primary key,
  created_at timestamptz not null default now(),
  constraint player_identity_labels_name_check check (
    char_length(name) between 1 and 60
    and name = btrim(name)
    and name !~ '[[:cntrl:]]'
    and name not in ('community_player', 'chunggang_player', 'xintai_player', '社區球員', '中港校隊', '國中部', '教練', '管理群', '其他')
  )
);
alter table public.player_identity_labels enable row level security;
revoke all on public.player_identity_labels from public, anon, authenticated;
grant select on public.player_identity_labels to authenticated;
grant all on public.player_identity_labels to service_role;
create policy player_identity_labels_read on public.player_identity_labels
  for select to authenticated using (
    public.has_app_permission('players', 'VIEW')
    or public.has_app_permission('players', 'CREATE')
    or public.has_app_permission('players', 'EDIT')
  );
insert into public.player_identity_labels(name) values ('新太陽社區棒球隊');

create schema if not exists private;
-- A private trigger is the sole client write path for the label catalog. The member
-- INSERT/UPDATE must still pass the existing players RLS in the same transaction.
create function private.capture_player_identity_label() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role <> '球員' then
    new.member_identity_label := null;
  else
    new.member_identity_label := nullif(btrim(new.member_identity_label), '');
  end if;
  if new.member_identity_label is not null then
    insert into public.player_identity_labels(name) values (new.member_identity_label)
      on conflict (name) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.capture_player_identity_label() from public, anon, authenticated;
create trigger capture_player_identity_label
  before insert or update of role, member_identity_label on public.team_members
  for each row execute function private.capture_player_identity_label();

alter table public.team_members add constraint team_members_identity_label_check
  check (member_identity_label is null or (role = '球員' and char_length(member_identity_label) between 1 and 60));
alter table public.team_members add constraint team_members_identity_label_fkey
  foreign key (member_identity_label) references public.player_identity_labels(name);
create index team_members_identity_label_idx on public.team_members(member_identity_label)
  where member_identity_label is not null;

-- Append only the non-sensitive label to the existing safe projection. Full edit
-- RPC returns SETOF team_members and automatically includes the new column.
create or replace view public.team_members_safe with (security_invoker = true) as
select tm.id, tm.name, tm.role, tm.team_group, tm.status, tm.birth_date,
  tm.is_early_enrollment, tm.is_primary_payer, tm.is_half_price,
  tm.jersey_number, tm.jersey_name, tm.jersey_size, tm.low_income_qualification,
  tm.sibling_ids, tm.sibling_id, tm.throwing_hand, tm.batting_hand,
  tm.contact_relation, tm.guardian_name, tm.portrait_auth, tm.notes,
  tm.avatar_url, tm.created_at, tm.is_inactive_or_graduated, tm.fee_billing_mode,
  tm.joined_date, tm.school_name, tm.grade, tm.training_program,
  tm.member_identity_label
from public.team_members tm;
grant select (member_identity_label) on public.team_members to authenticated;

notify pgrst, 'reload schema';
commit;
