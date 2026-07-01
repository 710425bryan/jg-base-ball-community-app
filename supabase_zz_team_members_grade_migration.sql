begin;

alter table public.team_members
  add column if not exists grade text;

comment on column public.team_members.grade
is 'School grade manually maintained from the roster UI. Empty values are initially inferred from birth_date using Taiwan academic year cutoff on September 1.';

with inferred_member_grades as (
  select
    tm.id,
    case (
      (
        case
          when extract(month from (now() at time zone 'Asia/Taipei')::date) > 9
            or (
              extract(month from (now() at time zone 'Asia/Taipei')::date) = 9
              and extract(day from (now() at time zone 'Asia/Taipei')::date) >= 1
            )
            then extract(year from (now() at time zone 'Asia/Taipei')::date)::integer
          else extract(year from (now() at time zone 'Asia/Taipei')::date)::integer - 1
        end
      )
      - (
        extract(year from tm.birth_date)::integer
        + case
            when (
              extract(month from tm.birth_date) > 9
              or (extract(month from tm.birth_date) = 9 and extract(day from tm.birth_date) >= 2)
            )
            and coalesce(tm.is_early_enrollment, false) = false
              then 1
            else 0
          end
      )
      - 5
    )
      when -2 then '幼稚園小班'
      when -1 then '幼稚園中班'
      when 0 then '幼稚園大班'
      when 1 then '國小一年級'
      when 2 then '國小二年級'
      when 3 then '國小三年級'
      when 4 then '國小四年級'
      when 5 then '國小五年級'
      when 6 then '國小六年級'
      when 7 then '國中一年級'
      when 8 then '國中二年級'
      when 9 then '國中三年級'
      when 10 then '高中一年級'
      when 11 then '高中二年級'
      when 12 then '高中三年級'
      else null
    end as inferred_grade
  from public.team_members tm
  where tm.birth_date is not null
    and tm.role in ('球員', '校隊')
)
update public.team_members tm
set grade = inferred_member_grades.inferred_grade
from inferred_member_grades
where tm.id = inferred_member_grades.id
  and nullif(btrim(coalesce(tm.grade, '')), '') is null
  and inferred_member_grades.inferred_grade is not null;

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
  tm.joined_date,
  tm.school_name,
  tm.grade
from public.team_members tm;

grant select on public.team_members_safe to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
