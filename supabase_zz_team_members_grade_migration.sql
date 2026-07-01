begin;

alter table public.team_members
  add column if not exists grade text;

comment on column public.team_members.grade
is 'School grade maintained from roster UI and yearly refresh. Birth cohort follows the September 2 enrollment cutoff; stored grade advances every June 19 Asia/Taipei.';

create or replace function public.infer_team_member_grade(
  p_birth_date date,
  p_is_early_enrollment boolean default false,
  p_today date default ((now() at time zone 'Asia/Taipei')::date)
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  with calculated as (
    select
      case
        when p_birth_date is null or p_today is null then null
        else (
          (
            case
              when extract(month from p_today)::integer > 6
                or (
                  extract(month from p_today)::integer = 6
                  and extract(day from p_today)::integer >= 19
                )
                then extract(year from p_today)::integer
              else extract(year from p_today)::integer - 1
            end
          )
          - (
            extract(year from p_birth_date)::integer
            + case
                when (
                  extract(month from p_birth_date)::integer > 9
                  or (
                    extract(month from p_birth_date)::integer = 9
                    and extract(day from p_birth_date)::integer >= 2
                  )
                )
                and coalesce(p_is_early_enrollment, false) = false
                  then 1
                else 0
              end
          )
          - 5
        )
      end as grade_index
  )
  select case grade_index
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
  end
  from calculated;
$$;

comment on function public.infer_team_member_grade(date, boolean, date)
is 'Infers a roster grade from birth_date. September 2 or later birthdays stay one cohort younger unless marked early enrollment; roster grade year rolls over on June 19 Asia/Taipei.';

create or replace function public.refresh_team_member_grades(
  p_today date default ((now() at time zone 'Asia/Taipei')::date)
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_updated_count integer;
begin
  if p_today is null then
    raise exception 'p_today cannot be null';
  end if;

  with inferred_member_grades as (
    select
      tm.id,
      public.infer_team_member_grade(
        tm.birth_date,
        coalesce(tm.is_early_enrollment, false),
        p_today
      ) as inferred_grade
    from public.team_members tm
    where tm.birth_date is not null
      and tm.role in ('球員', '校隊')
  )
  update public.team_members tm
  set grade = inferred_member_grades.inferred_grade
  from inferred_member_grades
  where tm.id = inferred_member_grades.id
    and tm.grade is distinct from inferred_member_grades.inferred_grade;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

comment on function public.refresh_team_member_grades(date)
is 'Refreshes stored team_members.grade for player roster members using infer_team_member_grade(). Scheduled yearly at June 19 00:05 Asia/Taipei.';

revoke all on function public.infer_team_member_grade(date, boolean, date) from public;
revoke all on function public.infer_team_member_grade(date, boolean, date) from anon;
revoke all on function public.infer_team_member_grade(date, boolean, date) from authenticated;
grant execute on function public.infer_team_member_grade(date, boolean, date) to service_role;

revoke all on function public.refresh_team_member_grades(date) from public;
revoke all on function public.refresh_team_member_grades(date) from anon;
revoke all on function public.refresh_team_member_grades(date) from authenticated;
grant execute on function public.refresh_team_member_grades(date) to service_role;

select public.refresh_team_member_grades((now() at time zone 'Asia/Taipei')::date);

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

create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'team-member-grade-yearly-refresh';

select cron.schedule(
  'team-member-grade-yearly-refresh',
  -- June 18 16:05 UTC = June 19 00:05 Asia/Taipei.
  '5 16 18 6 *',
  $$
  select public.refresh_team_member_grades((now() at time zone 'Asia/Taipei')::date);
  $$
);

notify pgrst, 'reload schema';

commit;
