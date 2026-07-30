-- Count every active player/school-team sibling when resolving a school-team
-- monthly discount. A sibling can legitimately use quarterly billing while the
-- discounted member uses monthly billing, so billing mode is not an eligibility
-- boundary for the family discount.

create or replace function public.is_school_team_monthly_fee_discounted(
  p_member_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_member public.team_members%rowtype;
  v_has_sibling_references boolean := false;
  v_has_active_sibling boolean := false;
begin
  select *
  into v_member
  from public.team_members
  where team_members.id = p_member_id;

  if not found then
    return false;
  end if;

  v_has_sibling_references := cardinality(coalesce(v_member.sibling_ids, array[]::uuid[])) > 0;

  select exists (
    select 1
    from public.team_members sibling
    where sibling.id = any(coalesce(v_member.sibling_ids, array[]::uuid[]))
      and sibling.role in ('球員', '校隊')
      and coalesce(sibling.status, '在隊') not in ('退隊', '離隊')
      and coalesce(sibling.is_inactive_or_graduated, false) = false
  )
  into v_has_active_sibling;

  if coalesce(v_member.is_half_price, false)
    and (not v_has_sibling_references or v_has_active_sibling)
  then
    return true;
  end if;

  if not v_has_sibling_references
    or coalesce(v_member.is_primary_payer, false)
  then
    return false;
  end if;

  return exists (
    select 1
    from public.team_members sibling
    where sibling.id = any(coalesce(v_member.sibling_ids, array[]::uuid[]))
      and sibling.role in ('球員', '校隊')
      and coalesce(sibling.status, '在隊') not in ('退隊', '離隊')
      and coalesce(sibling.is_inactive_or_graduated, false) = false
      and (
        coalesce(sibling.is_primary_payer, false)
        or v_member.id > sibling.id
      )
  );
end;
$$;

comment on function public.is_school_team_monthly_fee_discounted(uuid)
  is 'Returns whether a school-team monthly fee uses the family discount, counting active player/school-team siblings across billing modes.';

revoke all on function public.is_school_team_monthly_fee_discounted(uuid) from public, anon, authenticated;
grant execute on function public.is_school_team_monthly_fee_discounted(uuid) to service_role;

-- Repair only current/future unpaid per-session school-team snapshots that are
-- now known to be discounted. Paid history and periods under review are kept.
with repair_candidates as (
  select
    monthly_fee.id,
    public.get_school_team_monthly_per_session_amount(
      coalesce(monthly_fee.training_program, team_member.training_program, 'chunggang_school_team')::text,
      true
    ) as corrected_per_session_fee,
    case
      when coalesce(monthly_fee.training_program, team_member.training_program, '')::text = 'junior_high_school_team'
        then greatest(coalesce(monthly_fee.total_sessions, 0), 0)
      else greatest(
        coalesce(monthly_fee.total_sessions, 0) - coalesce(monthly_fee.leave_sessions, 0),
        0
      )
    end as billable_sessions
  from public.monthly_fees monthly_fee
  join public.team_members team_member
    on team_member.id = monthly_fee.member_id
  where monthly_fee.status = 'unpaid'
    and monthly_fee.calculation_type = 'per_session'
    and monthly_fee.year_month >= to_char(
      (now() at time zone 'Asia/Taipei')::date,
      'YYYY-MM'
    )
    and team_member.role = '校隊'
    and coalesce(team_member.fee_billing_mode, 'role_default') <> 'no_fee'
    and public.is_school_team_monthly_fee_discounted(team_member.id)
    and not exists (
      select 1
      from public.profile_payment_submissions payment_submission
      where payment_submission.member_id = monthly_fee.member_id
        and payment_submission.billing_mode = 'monthly'
        and payment_submission.period_key = monthly_fee.year_month
        and payment_submission.status = 'pending_review'
    )
)
update public.monthly_fees monthly_fee
set
  per_session_fee = repair_candidate.corrected_per_session_fee,
  payable_amount = greatest(
    repair_candidate.billable_sessions * repair_candidate.corrected_per_session_fee
      - coalesce(monthly_fee.deduction_amount, 0),
    0
  ),
  balance_amount = least(
    coalesce(monthly_fee.balance_amount, 0),
    greatest(
      repair_candidate.billable_sessions * repair_candidate.corrected_per_session_fee
        - coalesce(monthly_fee.deduction_amount, 0),
      0
    )
  ),
  updated_at = timezone('utc', now())
from repair_candidates repair_candidate
where monthly_fee.id = repair_candidate.id
  and (
    monthly_fee.per_session_fee is distinct from repair_candidate.corrected_per_session_fee
    or monthly_fee.payable_amount is distinct from greatest(
      repair_candidate.billable_sessions * repair_candidate.corrected_per_session_fee
        - coalesce(monthly_fee.deduction_amount, 0),
      0
    )
  );
