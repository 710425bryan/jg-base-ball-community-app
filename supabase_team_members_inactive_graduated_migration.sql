alter table public.team_members
add column if not exists is_inactive_or_graduated boolean not null default false;

comment on column public.team_members.is_inactive_or_graduated
is 'Manual flag for members who are inactive, closed, or graduated.';

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
  tm.is_inactive_or_graduated
from public.team_members tm;

grant select on public.team_members_safe to anon, authenticated, service_role;

notify pgrst, 'reload schema';
