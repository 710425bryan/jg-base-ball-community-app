alter table public.team_members
add column if not exists joined_date date;

update public.team_members
set joined_date = date '2026-02-01'
where joined_date is null;

alter table public.team_members
alter column joined_date set default ((now() at time zone 'Asia/Taipei')::date),
alter column joined_date set not null;

comment on column public.team_members.joined_date
is 'Member join date. Existing roster entries are backfilled to 2026-02-01; new rows default to the current Asia/Taipei date.';

create or replace view public.team_members_safe
with (security_invoker = true)
as
select
  tm.id,
  tm.name,
  tm.role,
  tm.team_group,
  tm.status,
  tm.birth_date,
  tm.is_early_enrollment,
  tm.is_primary_payer,
  tm.is_half_price,
  tm.jersey_number,
  tm.jersey_name,
  tm.jersey_size,
  tm.low_income_qualification,
  tm.sibling_ids,
  tm.sibling_id,
  tm.throwing_hand,
  tm.batting_hand,
  tm.contact_relation,
  tm.guardian_name,
  tm.portrait_auth,
  tm.notes,
  tm.avatar_url,
  tm.created_at,
  tm.is_inactive_or_graduated,
  tm.fee_billing_mode,
  tm.joined_date
from public.team_members tm;

grant select on public.team_members_safe to anon, authenticated, service_role;

notify pgrst, 'reload schema';
