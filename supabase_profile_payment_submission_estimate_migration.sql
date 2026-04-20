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
  deduction_amount integer
)
language sql
security definer
set search_path = public
as $function$
with normalized_input as (
  select upper(nullif(btrim(p_period_key), '')) as period_key
),
linked_member as (
  select
    team_members.id as member_id,
    team_members.name::text as member_name,
    team_members.role::text as member_role,
    coalesce(team_members.is_half_price, false) as is_half_price,
    coalesce(team_members.is_primary_payer, false) as is_primary_payer,
    coalesce(team_members.sibling_ids, array[]::uuid[]) as sibling_ids,
    coalesce(fee_settings.per_session_fee, 500) as base_fee
  from public.profiles
  join public.team_members
    on team_members.id = p_member_id
  left join public.fee_settings
    on fee_settings.member_id = team_members.id
  where profiles.id = auth.uid()
    and (
      p_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
      or profiles.role = 'ADMIN'
    )
  limit 1
),
stored_monthly_total as (
  select
    case
      when count(distinct monthly_fees.total_sessions) = 1 then max(monthly_fees.total_sessions)
      else 4
    end as total_sessions
  from normalized_input
  left join public.monthly_fees
    on monthly_fees.year_month = normalized_input.period_key
),
monthly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    normalized_input.period_key,
    linked_member.base_fee,
    linked_member.is_half_price,
    linked_member.is_primary_payer,
    linked_member.sibling_ids,
    stored_monthly_total.total_sessions as total_sessions,
    coalesce(monthly_fees.deduction_amount, 0) as deduction_amount,
    coalesce(leave_stats.leave_sessions, 0) as leave_sessions,
    case
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
  cross join normalized_input
  cross join stored_monthly_total
  left join public.monthly_fees
    on monthly_fees.member_id = linked_member.member_id
   and monthly_fees.year_month = normalized_input.period_key
  left join lateral (
    select
      coalesce(count(distinct leave_day::date), 0)::integer as leave_sessions
    from public.leave_requests
    cross join lateral generate_series(
      greatest(
        leave_requests.start_date,
        to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD')
      ),
      least(
        leave_requests.end_date,
        (to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
      ),
      interval '1 day'
    ) as leave_day
    where leave_requests.user_id = linked_member.member_id
      and leave_requests.start_date <= (to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
      and leave_requests.end_date >= to_date(normalized_input.period_key || '-01', 'YYYY-MM-DD')
  ) as leave_stats on normalized_input.period_key ~ '^[0-9]{4}-[0-9]{2}$'
  left join lateral (
    select
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and coalesce(sibling.is_primary_payer, false)
      ) as has_primary_sibling,
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and linked_member.member_id > sibling.id
      ) as has_fallback_discount
  ) as sibling_flags on true
  where linked_member.member_role = '校隊'
    and normalized_input.period_key ~ '^[0-9]{4}-[0-9]{2}$'
),
quarterly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    normalized_input.period_key,
    coalesce(quarterly_fee.amount, 0) as amount
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
  where linked_member.member_role = '球員'
    and normalized_input.period_key ~ '^[0-9]{4}-Q[1-4]$'
)
select
  monthly_context.member_id,
  monthly_context.member_name,
  'monthly'::text as billing_mode,
  monthly_context.period_key,
  monthly_context.period_key as period_label,
  greatest(monthly_context.total_sessions - monthly_context.leave_sessions, 0) * monthly_context.per_session_fee - monthly_context.deduction_amount as amount,
  monthly_context.total_sessions,
  monthly_context.leave_sessions,
  monthly_context.per_session_fee,
  monthly_context.deduction_amount
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
  null::integer as deduction_amount
from quarterly_context;
$function$;

grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated;

notify pgrst, 'reload schema';
