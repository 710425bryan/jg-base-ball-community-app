begin;

-- Keep the two school-team programs independent. Chunggang always uses
-- training dates, while junior-high defaults to one configured monthly amount.
insert into public.system_settings (key, value, description)
values
  (
    'chunggang_monthly_per_session_defaults',
    jsonb_build_object(
      'calculation_mode', 'training_dates',
      'single_monthly_fee', 2000,
      'regular_per_session_fee', 500,
      'discount_per_session_fee', 250
    ),
    '中港校隊計次月費單次收費預設'
  ),
  (
    'xintai_monthly_per_session_defaults',
    jsonb_build_object(
      'calculation_mode', 'single_monthly',
      'single_monthly_fee', 2000,
      'regular_per_session_fee', 500,
      'discount_per_session_fee', 250
    ),
    '國中部計次月費計算模式與收費預設'
  )
on conflict (key) do nothing;

update public.system_settings
set
  value = jsonb_build_object(
    'calculation_mode', 'training_dates',
    'single_monthly_fee', case
      when jsonb_typeof(value -> 'single_monthly_fee') = 'number'
        then greatest(trunc((value ->> 'single_monthly_fee')::numeric)::integer, 0)
      else 2000
    end,
    'regular_per_session_fee', case
      when jsonb_typeof(value -> 'regular_per_session_fee') = 'number'
        then greatest(trunc((value ->> 'regular_per_session_fee')::numeric)::integer, 0)
      else 500
    end,
    'discount_per_session_fee', case
      when jsonb_typeof(value -> 'discount_per_session_fee') = 'number'
        then greatest(trunc((value ->> 'discount_per_session_fee')::numeric)::integer, 0)
      else 250
    end
  ),
  description = '中港校隊計次月費單次收費預設',
  updated_at = timezone('utc', now())
where key = 'chunggang_monthly_per_session_defaults';

update public.system_settings
set
  value = jsonb_build_object(
    'calculation_mode', case
      when value ->> 'calculation_mode' = 'training_dates' then 'training_dates'
      else 'single_monthly'
    end,
    'single_monthly_fee', case
      when jsonb_typeof(value -> 'single_monthly_fee') = 'number'
        then greatest(trunc((value ->> 'single_monthly_fee')::numeric)::integer, 0)
      else 2000
    end,
    'regular_per_session_fee', case
      when jsonb_typeof(value -> 'regular_per_session_fee') = 'number'
        then greatest(trunc((value ->> 'regular_per_session_fee')::numeric)::integer, 0)
      else 500
    end,
    'discount_per_session_fee', case
      when jsonb_typeof(value -> 'discount_per_session_fee') = 'number'
        then greatest(trunc((value ->> 'discount_per_session_fee')::numeric)::integer, 0)
      else 250
    end
  ),
  description = '國中部計次月費計算模式與收費預設',
  updated_at = timezone('utc', now())
where key = 'xintai_monthly_per_session_defaults';

create or replace function public.get_school_team_monthly_calculation_mode(
  p_program_key text
)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_program_key text;
  v_value jsonb := '{}'::jsonb;
begin
  v_program_key := public.normalize_training_program_key(p_program_key);
  if v_program_key not in ('chunggang_school_team', 'junior_high_school_team') then
    raise exception 'unsupported school team program: %', p_program_key;
  end if;

  if v_program_key = 'chunggang_school_team' then
    return 'training_dates';
  end if;

  select coalesce(system_settings.value, '{}'::jsonb)
  into v_value
  from public.system_settings
  where system_settings.key = 'xintai_monthly_per_session_defaults';

  return case
    when v_value ->> 'calculation_mode' = 'training_dates' then 'training_dates'
    else 'single_monthly'
  end;
end;
$$;

create or replace function public.get_school_team_single_monthly_amount(
  p_program_key text,
  p_is_discounted boolean default false
)
returns integer
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_program_key text;
  v_setting_key text;
  v_value jsonb := '{}'::jsonb;
  v_single_monthly_fee integer := 2000;
begin
  v_program_key := public.normalize_training_program_key(p_program_key);
  if v_program_key not in ('chunggang_school_team', 'junior_high_school_team') then
    raise exception 'unsupported school team program: %', p_program_key;
  end if;

  v_setting_key := case
    when v_program_key = 'junior_high_school_team' then 'xintai_monthly_per_session_defaults'
    else 'chunggang_monthly_per_session_defaults'
  end;

  select coalesce(system_settings.value, '{}'::jsonb)
  into v_value
  from public.system_settings
  where system_settings.key = v_setting_key;

  if jsonb_typeof(v_value -> 'single_monthly_fee') = 'number' then
    v_single_monthly_fee := greatest(
      trunc((v_value ->> 'single_monthly_fee')::numeric)::integer,
      0
    );
  end if;

  return case
    when coalesce(p_is_discounted, false) then round(v_single_monthly_fee / 2.0)::integer
    else v_single_monthly_fee
  end;
end;
$$;

create or replace function public.get_school_team_monthly_per_session_defaults(
  p_program_key text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not (
    public.has_app_permission('fees', 'VIEW')
    or public.has_app_permission('fees', 'EDIT')
  ) then
    raise exception 'fees VIEW permission required';
  end if;

  return jsonb_build_object(
    'calculation_mode', public.get_school_team_monthly_calculation_mode(p_program_key),
    'single_monthly_fee', public.get_school_team_single_monthly_amount(p_program_key, false),
    'regular_per_session_fee', public.get_school_team_monthly_per_session_amount(p_program_key, false),
    'discount_per_session_fee', public.get_school_team_monthly_per_session_amount(p_program_key, true)
  );
end;
$$;

drop function if exists public.save_school_team_monthly_per_session_defaults(text, integer, integer);

create or replace function public.save_school_team_monthly_per_session_defaults(
  p_program_key text,
  p_calculation_mode text,
  p_single_monthly_fee integer,
  p_regular_per_session_fee integer,
  p_discount_per_session_fee integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program_key text;
  v_setting_key text;
  v_description text;
  v_calculation_mode text;
  v_defaults jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  v_program_key := public.normalize_training_program_key(p_program_key);
  if v_program_key not in ('chunggang_school_team', 'junior_high_school_team') then
    raise exception 'unsupported school team program: %', p_program_key;
  end if;

  v_setting_key := case
    when v_program_key = 'junior_high_school_team' then 'xintai_monthly_per_session_defaults'
    else 'chunggang_monthly_per_session_defaults'
  end;
  v_description := case
    when v_program_key = 'junior_high_school_team'
      then '國中部計次月費計算模式與收費預設'
    else '中港校隊計次月費單次收費預設'
  end;
  v_calculation_mode := case
    when v_program_key = 'junior_high_school_team'
      and p_calculation_mode = 'training_dates'
      then 'training_dates'
    when v_program_key = 'junior_high_school_team'
      then 'single_monthly'
    else 'training_dates'
  end;

  v_defaults := jsonb_build_object(
    'calculation_mode', v_calculation_mode,
    'single_monthly_fee', greatest(coalesce(p_single_monthly_fee, 2000), 0),
    'regular_per_session_fee', greatest(coalesce(p_regular_per_session_fee, 500), 0),
    'discount_per_session_fee', greatest(coalesce(p_discount_per_session_fee, 250), 0)
  );

  insert into public.system_settings (key, value, description, updated_at)
  values (
    v_setting_key,
    v_defaults,
    v_description,
    timezone('utc', now())
  )
  on conflict (key) do update
    set value = excluded.value,
        description = excluded.description,
        updated_at = excluded.updated_at;

  return v_defaults;
end;
$$;

-- Repair only safe rollout snapshots. Paid history and periods already submitted
-- for review retain the exact amount that was originally reported.
update public.monthly_fees as monthly_fee
set
  calculation_type = 'monthly_fixed',
  fixed_monthly_fee = public.get_school_team_single_monthly_amount(
    team_member.training_program::text,
    public.is_school_team_monthly_fee_discounted(team_member.id)
  ),
  per_session_fee = 0,
  payable_amount = greatest(
    public.get_school_team_single_monthly_amount(
      team_member.training_program::text,
      public.is_school_team_monthly_fee_discounted(team_member.id)
    ) - coalesce(monthly_fee.deduction_amount, 0),
    0
  ),
  updated_at = timezone('utc', now())
from public.team_members as team_member
where monthly_fee.member_id = team_member.id
  and monthly_fee.status = 'unpaid'
  and monthly_fee.year_month >= to_char(
    (now() at time zone 'Asia/Taipei')::date,
    'YYYY-MM'
  )
  and team_member.role = '校隊'
  and team_member.training_program::text = 'junior_high_school_team'
  and coalesce(team_member.fee_billing_mode, 'role_default') <> 'no_fee'
  and public.get_school_team_monthly_calculation_mode(
    team_member.training_program::text
  ) = 'single_monthly'
  and not exists (
    select 1
    from public.profile_payment_submissions as payment_submission
    where payment_submission.member_id = monthly_fee.member_id
      and payment_submission.billing_mode = 'monthly'
      and payment_submission.period_key = monthly_fee.year_month
      and payment_submission.status = 'pending_review'
  );

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
    team_members.team_group::text as team_group,
    team_members.training_program::text as raw_training_program,
    coalesce(team_members.fee_billing_mode, 'role_default') as fee_billing_mode,
    public.get_effective_payment_billing_mode(
      team_members.role::text,
      team_members.fee_billing_mode::text
    ) as billing_mode,
    case
      when team_members.role = '校隊'
        and coalesce(team_members.fee_billing_mode, 'role_default') <> 'no_fee'
        and team_members.training_program::text = 'junior_high_school_team'
        and public.get_school_team_monthly_calculation_mode(
          team_members.training_program::text
        ) = 'single_monthly'
        then 'monthly_fixed'
      else public.get_monthly_fee_calculation_type(
        team_members.role::text,
        team_members.fee_billing_mode::text,
        team_members.training_program::text
      )
    end as calculation_type,
    public.get_member_training_program_key_v2(
      team_members.training_program::text,
      team_members.team_group::text,
      team_members.role::text,
      team_members.fee_billing_mode::text
    ) as training_program_key,
    team_members.role = '校隊'
      and coalesce(team_members.fee_billing_mode, 'role_default') <> 'no_fee'
      as is_school_team_monthly,
    public.is_school_team_monthly_fee_discounted(team_members.id) as is_school_team_discounted,
    coalesce(team_members.is_half_price, false) as is_half_price,
    coalesce(team_members.is_primary_payer, false) as is_primary_payer,
    coalesce(team_members.sibling_ids, array[]::uuid[]) as sibling_ids,
    coalesce(fee_settings.per_session_fee, 500) as base_fee,
    case
      when team_members.role = '校隊'
        and coalesce(team_members.fee_billing_mode, 'role_default') <> 'no_fee'
        and team_members.training_program::text = 'junior_high_school_team'
        and public.get_school_team_monthly_calculation_mode(
          team_members.training_program::text
        ) = 'single_monthly'
        then public.get_school_team_single_monthly_amount(
          team_members.training_program::text,
          public.is_school_team_monthly_fee_discounted(team_members.id)
        )
      else coalesce(fee_settings.monthly_fixed_fee, 2000)
    end as monthly_fixed_fee
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
training_month_dates as (
  select
    month_input.period_key,
    linked_member.training_program_key,
    training_dates.training_date
  from linked_member
  cross join month_input
  cross join lateral (
    select distinct source_dates.training_date::date as training_date
    from (
      select configured_day.training_date::date as training_date
      from public.training_month_date_settings settings
      cross join lateral unnest(
        coalesce(settings.training_dates, '{}'::date[])
      ) as configured_day(training_date)
      where settings.month_start = month_input.month_start
        and coalesce(settings.program_key, 'chunggang_school_team') = linked_member.training_program_key

      union all

      select default_day.training_date::date as training_date
      from unnest(
        public.get_default_training_month_dates(
          month_input.month_start,
          linked_member.training_program_key
        )
      ) as default_day(training_date)
      where not exists (
        select 1
        from public.training_month_date_settings settings
        where settings.month_start = month_input.month_start
          and coalesce(settings.program_key, 'chunggang_school_team') = linked_member.training_program_key
      )
    ) as source_dates
    where source_dates.training_date is not null
      and date_trunc('month', source_dates.training_date)::date = month_input.month_start
  ) as training_dates
),
training_month_total as (
  select
    training_month_dates.period_key,
    training_month_dates.training_program_key,
    count(distinct training_month_dates.training_date)::integer as total_sessions
  from training_month_dates
  group by training_month_dates.period_key, training_month_dates.training_program_key
),
monthly_context as (
  select
    linked_member.member_id,
    linked_member.member_name,
    linked_member.training_program_key,
    month_input.period_key,
    coalesce(monthly_fees.calculation_type, linked_member.calculation_type) as calculation_type,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed'
        then coalesce(monthly_fees.fixed_monthly_fee, linked_member.monthly_fixed_fee, 2000)
      else null
    end as fixed_monthly_fee,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed'
        and linked_member.training_program_key <> 'junior_high_school_team'
        then null::integer
      else coalesce(monthly_fees.total_sessions, training_month_total.total_sessions, 0)
    end as total_sessions,
    coalesce(monthly_fees.deduction_amount, 0) as deduction_amount,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed'
        and linked_member.training_program_key <> 'junior_high_school_team'
        then null::integer
      else coalesce(monthly_fees.leave_sessions, leave_stats.leave_sessions, 0)
    end as leave_sessions,
    case
      when coalesce(monthly_fees.calculation_type, linked_member.calculation_type) = 'monthly_fixed'
        then null::integer
      when monthly_fees.id is not null and monthly_fees.per_session_fee is not null
        then monthly_fees.per_session_fee
      when linked_member.is_school_team_monthly
        then public.get_school_team_monthly_per_session_amount(
          linked_member.training_program_key,
          linked_member.is_school_team_discounted
        )
      when linked_member.is_half_price
        then round(linked_member.base_fee / 2.0)::integer
      when cardinality(linked_member.sibling_ids) > 0
        and not linked_member.is_primary_payer
        and (
          sibling_flags.has_primary_sibling
          or sibling_flags.has_fallback_discount
        ) then round(linked_member.base_fee / 2.0)::integer
      else linked_member.base_fee
    end as per_session_fee,
    monthly_fees.payable_amount as stored_payable_amount
  from linked_member
  cross join month_input
  left join training_month_total
    on training_month_total.period_key = month_input.period_key
   and training_month_total.training_program_key = linked_member.training_program_key
  left join public.monthly_fees
    on monthly_fees.member_id = linked_member.member_id
   and monthly_fees.year_month = month_input.period_key
  left join lateral (
    select
      coalesce(count(distinct leave_day::date), 0)::integer as leave_sessions
    from public.leave_requests
    cross join lateral generate_series(
      greatest(leave_requests.start_date, month_input.month_start),
      least(
        coalesce(leave_requests.end_date, leave_requests.start_date),
        (month_input.month_start + interval '1 month - 1 day')::date
      ),
      interval '1 day'
    ) as leave_day
    join training_month_dates
      on training_month_dates.period_key = month_input.period_key
     and training_month_dates.training_program_key = linked_member.training_program_key
     and training_month_dates.training_date = leave_day::date
    where leave_requests.user_id = linked_member.member_id
      and public.is_monthly_fee_deductible_leave_segment(leave_requests.leave_time_segment)
      and leave_requests.start_date <= (month_input.month_start + interval '1 month - 1 day')::date
      and coalesce(leave_requests.end_date, leave_requests.start_date) >= month_input.month_start
  ) as leave_stats on true
  left join lateral (
    select
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and coalesce(sibling.is_primary_payer, false)
          and public.get_effective_payment_billing_mode(
            sibling.role::text,
            sibling.fee_billing_mode::text
          ) = 'monthly'
      ) as has_primary_sibling,
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and linked_member.member_id > sibling.id
          and public.get_effective_payment_billing_mode(
            sibling.role::text,
            sibling.fee_billing_mode::text
          ) = 'monthly'
      ) as has_fallback_discount
  ) as sibling_flags on true
  where linked_member.billing_mode = 'monthly'
     or (linked_member.billing_mode = 'none' and monthly_fees.id is not null)
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
    select quarterly_fees.id, quarterly_fees.amount
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
          and public.get_effective_payment_billing_mode(
            sibling.role::text,
            sibling.fee_billing_mode::text
          ) = 'quarterly'
      ) as has_primary_sibling,
      exists (
        select 1
        from public.team_members sibling
        where sibling.id = any(linked_member.sibling_ids)
          and linked_member.member_id > sibling.id
          and public.get_effective_payment_billing_mode(
            sibling.role::text,
            sibling.fee_billing_mode::text
          ) = 'quarterly'
      ) as has_fallback_discount
  ) as sibling_flags on true
  where normalized_input.period_key ~ '^[0-9]{4}-Q[1-4]$'
    and public.is_quarterly_payment_period_open(normalized_input.period_key)
    and (
      linked_member.billing_mode = 'quarterly'
      or (linked_member.billing_mode = 'none' and quarterly_fee.id is not null)
    )
)
select
  monthly_context.member_id,
  monthly_context.member_name,
  'monthly'::text as billing_mode,
  monthly_context.period_key,
  monthly_context.period_key as period_label,
  coalesce(
    monthly_context.stored_payable_amount,
    case
      when monthly_context.calculation_type = 'monthly_fixed'
        then monthly_context.fixed_monthly_fee - monthly_context.deduction_amount
      when monthly_context.training_program_key = 'junior_high_school_team'
        then coalesce(monthly_context.total_sessions, 0)
          * coalesce(monthly_context.per_session_fee, 0)
          - monthly_context.deduction_amount
      else greatest(
        coalesce(monthly_context.total_sessions, 0)
        - coalesce(monthly_context.leave_sessions, 0),
        0
      ) * coalesce(monthly_context.per_session_fee, 0) - monthly_context.deduction_amount
    end
  ) as amount,
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

revoke all on function public.get_school_team_monthly_calculation_mode(text) from public, anon, authenticated;
revoke all on function public.get_school_team_single_monthly_amount(text, boolean) from public, anon, authenticated;
revoke all on function public.get_school_team_monthly_per_session_defaults(text) from public, anon;
revoke all on function public.save_school_team_monthly_per_session_defaults(text, text, integer, integer, integer) from public, anon;
revoke all on function public.get_my_payment_submission_estimate(uuid, text) from public, anon;

grant execute on function public.get_school_team_monthly_calculation_mode(text) to service_role;
grant execute on function public.get_school_team_single_monthly_amount(text, boolean) to service_role;
grant execute on function public.get_school_team_monthly_per_session_defaults(text) to authenticated, service_role;
grant execute on function public.save_school_team_monthly_per_session_defaults(text, text, integer, integer, integer) to authenticated, service_role;
grant execute on function public.get_my_payment_submission_estimate(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
