begin;

create or replace function public.get_my_payment_submission_estimate(
  p_member_id uuid,
  p_period_key text
)
returns table (
  member_id uuid,
  member_name text,
  billing_mode text,
  period_key text,
  period_label text,
  amount integer,
  total_sessions integer,
  leave_sessions integer,
  per_session_fee integer,
  deduction_amount integer,
  calculation_type text,
  fixed_monthly_fee integer
)
language sql
security definer
set search_path = public
as $function$
with normalized_input as (
  select upper(nullif(btrim(p_period_key), '')) as period_key
),
month_input as (
  select
    normalized_input.period_key,
    to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD')::date as month_start
  from normalized_input
  where normalized_input.period_key ~ '^[0-9]{4}-[0-9]{2}$'
),
linked_member as (
  select
    team_members.id as member_id,
    team_members.name::text as member_name,
    team_members.role::text as member_role,
    coalesce(team_members.fee_billing_mode, 'role_default') as fee_billing_mode,
    public.get_effective_payment_billing_mode(team_members.role::text, team_members.fee_billing_mode::text) as billing_mode,
    public.get_monthly_fee_calculation_type(team_members.role::text, team_members.fee_billing_mode::text) as calculation_type,
    coalesce(team_members.is_half_price, false) as is_half_price,
    coalesce(team_members.is_primary_payer, false) as is_primary_payer,
    coalesce(team_members.sibling_ids, array[]::uuid[]) as sibling_ids,
    coalesce(fee_settings.per_session_fee, 500) as base_fee,
    coalesce(fee_settings.monthly_fixed_fee, 2000) as monthly_fixed_fee
  from public.profiles
  join public.team_members
    on team_members.id = p_member_id
  left join public.fee_settings
    on fee_settings.member_id = team_members.id
  where profiles.id = auth.uid()
    and (
      p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      or profiles.role = 'ADMIN'
      or public.has_app_permission('fees', 'VIEW')
      or public.has_app_permission('fees', 'EDIT')
    )
  limit 1
),
training_month_total as (
  select
    month_input.period_key,
    case
      when exists (
        select 1
        from public.training_month_date_settings settings
        where settings.month_start = month_input.month_start
      ) then (
        select count(distinct training_day.training_date)::integer
        from public.training_month_date_settings settings
        cross join lateral unnest(coalesce(settings.training_dates, '{}'::date[])) as training_day(training_date)
        where settings.month_start = month_input.month_start
          and date_trunc('month', training_day.training_date)::date = month_input.month_start
      )
      else cardinality(public.get_default_training_month_dates(month_input.month_start))
    end as total_sessions
  from month_input
),
monthly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    month_input.period_key,
    coalesce(monthly_fees.calculation_type, linked_member.calculation_type) as calculation_type,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed'
        then coalesce(monthly_fees.fixed_monthly_fee, linked_member.monthly_fixed_fee, 2000)
      else null
    end as fixed_monthly_fee,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      else coalesce(training_month_total.total_sessions, 0)
    end as total_sessions,
    coalesce(monthly_fees.deduction_amount, 0) as deduction_amount,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      else coalesce(monthly_fees.leave_sessions, leave_stats.leave_sessions, 0)
    end as leave_sessions,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed' then null::integer
      when monthly_fees.id is not null and monthly_fees.per_session_fee is not null then monthly_fees.per_session_fee
      when linked_member.is_half_price then round(linked_member.base_fee / 2.0)::integer
      when cardinality(linked_member.sibling_ids) > 0
        and not linked_member.is_primary_payer
        and (
          sibling_flags.has_primary_sibling
          or sibling_flags.has_fallback_discount
        ) then round(linked_member.base_fee / 2.0)::integer
      else linked_member.base_fee
    end as per_session_fee
  from linked_member
  cross join month_input
  join training_month_total
    on training_month_total.period_key = month_input.period_key
  left join public.monthly_fees
    on monthly_fees.member_id = linked_member.member_id
   and monthly_fees.year_month = month_input.period_key
  left join lateral (
    select
      coalesce(count(distinct leave_day::date), 0)::integer as leave_sessions
    from public.leave_requests
    cross join lateral generate_series(
      greatest(
        leave_requests.start_date,
        month_input.month_start
      ),
      least(
        leave_requests.end_date,
        (month_input.month_start + interval '1 month - 1 day')::date
      ),
      interval '1 day'
    ) as leave_day
    where leave_requests.user_id = linked_member.member_id
      and leave_requests.start_date <= (month_input.month_start + interval '1 month - 1 day')::date
      and leave_requests.end_date >= month_input.month_start
  ) as leave_stats on true
  left join lateral (
    select
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and coalesce(sibling.is_primary_payer, false)
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'monthly'
      ) as has_primary_sibling,
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and linked_member.member_id > sibling.id
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'monthly'
      ) as has_fallback_discount
  ) as sibling_flags on true
  where linked_member.billing_mode = 'monthly'
),
quarterly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    normalized_input.period_key,
    coalesce(
      nullif(quarterly_fee.amount, 0),
      case
        when linked_member.is_half_price then 3000
        when cardinality(linked_member.sibling_ids) > 0
          and not linked_member.is_primary_payer
          and (
            sibling_flags.has_primary_sibling
            or sibling_flags.has_fallback_discount
          ) then 3000
        else 6000
      end
    ) as amount
  from linked_member
  cross join normalized_input
  left join lateral (
    select quarterly_fees.amount
    from public.quarterly_fees
    where (
      quarterly_fees.member_id = linked_member.member_id
      or linked_member.member_id = any(coalesce(quarterly_fees.member_ids, array[]::uuid[]))
    )
      and quarterly_fees.year_quarter = normalized_input.period_key
    order by quarterly_fees.updated_at desc nulls last, quarterly_fees.created_at desc nulls last
    limit 1
  ) as quarterly_fee on true
  left join lateral (
    select
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and coalesce(sibling.is_primary_payer, false)
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'quarterly'
      ) as has_primary_sibling,
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and linked_member.member_id > sibling.id
          and public.get_effective_payment_billing_mode(sibling.role::text, sibling.fee_billing_mode::text) = 'quarterly'
      ) as has_fallback_discount
  ) as sibling_flags on true
  where linked_member.billing_mode = 'quarterly'
    and normalized_input.period_key ~ '^[0-9]{4}-Q[1-4]$'
)
select
  monthly_context.member_id,
  monthly_context.member_name,
  'monthly'::text as billing_mode,
  monthly_context.period_key,
  monthly_context.period_key as period_label,
  case
    when monthly_context.calculation_type = 'monthly_fixed'
      then monthly_context.fixed_monthly_fee - monthly_context.deduction_amount
    else greatest(coalesce(monthly_context.total_sessions, 0) - coalesce(monthly_context.leave_sessions, 0), 0) * coalesce(monthly_context.per_session_fee, 0) - monthly_context.deduction_amount
  end as amount,
  monthly_context.total_sessions,
  monthly_context.leave_sessions,
  monthly_context.per_session_fee,
  monthly_context.deduction_amount,
  monthly_context.calculation_type,
  monthly_context.fixed_monthly_fee
from monthly_context

union all

select
  quarterly_context.member_id,
  quarterly_context.member_name,
  'quarterly'::text as billing_mode,
  quarterly_context.period_key,
  quarterly_context.period_key as period_label,
  quarterly_context.amount,
  null::integer as total_sessions,
  null::integer as leave_sessions,
  null::integer as per_session_fee,
  null::integer as deduction_amount,
  null::text as calculation_type,
  null::integer as fixed_monthly_fee
from quarterly_context;
$function$;

revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public;
grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
