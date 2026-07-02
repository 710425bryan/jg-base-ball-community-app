begin;

alter table public.team_members
drop constraint if exists team_members_fee_billing_mode_check;

alter table public.team_members
add constraint team_members_fee_billing_mode_check
check (fee_billing_mode in ('role_default', 'monthly_fixed', 'monthly_per_session', 'no_fee'));

comment on column public.team_members.fee_billing_mode
is 'Manual billing override. role_default follows member role; monthly_fixed keeps role 球員 but bills through fixed monthly fees; monthly_per_session keeps role 球員 but bills through per-session monthly fees; no_fee excludes the member from new team and match fees.';

drop function if exists public.get_effective_payment_billing_mode(text, text);

create or replace function public.get_effective_payment_billing_mode(
  p_role text,
  p_fee_billing_mode text default 'role_default'
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_role in ('球員', '校隊') and coalesce(p_fee_billing_mode, 'role_default') = 'no_fee' then 'none'
    when p_role = '校隊' then 'monthly'
    when p_role = '球員'
      and coalesce(p_fee_billing_mode, 'role_default') in ('monthly_fixed', 'monthly_per_session') then 'monthly'
    when p_role = '球員' then 'quarterly'
    else null
  end;
$$;

drop function if exists public.get_monthly_fee_calculation_type(text, text);

create or replace function public.get_monthly_fee_calculation_type(
  p_role text,
  p_fee_billing_mode text default 'role_default'
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_role = '球員' and coalesce(p_fee_billing_mode, 'role_default') = 'monthly_fixed' then 'monthly_fixed'
    else 'per_session'
  end;
$$;

drop function if exists public.list_my_payment_members();

create or replace function public.list_my_payment_members()
returns table (
  member_id uuid,
  name text,
  role text,
  billing_mode text,
  fee_billing_mode text,
  is_linked boolean,
  balance_amount integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  return query
  select
    team_members.id,
    team_members.name::text,
    team_members.role::text,
    public.get_effective_payment_billing_mode(
      team_members.role::text,
      team_members.fee_billing_mode::text
    ) as billing_mode,
    team_members.fee_billing_mode::text,
    team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) as is_linked,
    public.get_player_balance_unchecked(team_members.id) as balance_amount
  from public.profiles
  join public.team_members
    on (
      team_members.role in ('校隊', '球員')
      and coalesce(team_members.status, '在隊') not in ('退隊', '離隊')
      and coalesce(team_members.is_inactive_or_graduated, false) = false
      and (
        team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))
        or public.has_app_permission('fees', 'VIEW')
        or public.has_app_permission('fees', 'EDIT')
      )
    )
  where profiles.id = v_user_id
  order by
    case when team_members.id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[])) then 0 else 1 end,
    case
      when team_members.role = '校隊' and team_members.fee_billing_mode <> 'no_fee' then 0
      when team_members.fee_billing_mode = 'monthly_per_session' then 1
      when team_members.fee_billing_mode = 'monthly_fixed' then 2
      when public.get_effective_payment_billing_mode(team_members.role::text, team_members.fee_billing_mode::text) = 'quarterly' then 3
      else 4
    end,
    team_members.name asc;
end;
$$;

create or replace function public.get_fee_management_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_can_view_fees boolean := false;
  v_monthly_period text := case
    when extract(day from current_date)::integer >= 25 then to_char(current_date, 'YYYY-MM')
    else to_char(current_date - interval '1 month', 'YYYY-MM')
  end;
  v_quarterly_period text := to_char(current_date, 'YYYY') || '-Q' || extract(quarter from current_date)::integer::text;
  v_snapshot jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_can_view_fees := public.has_app_permission('fees', 'VIEW');

  if not v_can_view_fees then
    raise exception 'permission denied';
  end if;

  with reminder_items as (
    select *
    from (
      select
        'profile-payment-pending'::text as id,
        'profilePaymentPending'::text as kind,
        '個人付款待確認'::text as title,
        format('%s 筆個人付款回報等待確認，合計 $%s。', item_count, total_amount) as body,
        item_count,
        total_amount,
        'urgent'::text as severity,
        case
          when latest_id is not null then format('/fees?highlight_submission_id=%s', latest_id)
          else '/fees'::text
        end as link,
        coalesce(latest_created_at, now()) as created_at,
        1 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(pps.amount), 0)::integer as total_amount,
          (array_agg(pps.id::text order by pps.created_at desc))[1] as latest_id,
          max(pps.created_at) as latest_created_at
        from public.profile_payment_submissions pps
        where pps.status = 'pending_review'
      ) profile_payments

      union all

      select
        'equipment-payment-pending'::text as id,
        'equipmentPaymentPending'::text as kind,
        '裝備付款待確認'::text as title,
        format('%s 筆裝備付款回報等待確認，合計 $%s。', item_count, total_amount) as body,
        item_count,
        total_amount,
        'urgent'::text as severity,
        case
          when latest_id is not null then format('/fees?tab=equipment&highlight_equipment_submission_id=%s', latest_id)
          else '/fees?tab=equipment'::text
        end as link,
        coalesce(latest_created_at, now()) as created_at,
        1 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(eps.amount), 0)::integer as total_amount,
          (array_agg(eps.id::text order by eps.created_at desc))[1] as latest_id,
          max(eps.created_at) as latest_created_at
        from public.equipment_payment_submissions eps
        where eps.status = 'pending_review'
      ) equipment_payments

      union all

      select
        'equipment-request-pending'::text as id,
        'equipmentRequestPending'::text as kind,
        '裝備請購待審核'::text as title,
        format('%s 筆裝備加購申請等待審核，預估合計 $%s。', item_count, total_amount) as body,
        item_count,
        total_amount,
        'urgent'::text as severity,
        case
          when latest_id is not null then format('/fees?tab=equipment&highlight_id=%s', latest_id)
          else '/fees?tab=equipment'::text
        end as link,
        coalesce(latest_created_at, now()) as created_at,
        1 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(request_amount), 0)::integer as total_amount,
          (array_agg(id::text order by created_at desc))[1] as latest_id,
          max(created_at) as latest_created_at
        from (
          select
            r.id,
            coalesce(r.requested_at, r.created_at) as created_at,
            coalesce(sum(coalesce(ri.unit_price_snapshot, e.purchase_price, 0) * ri.quantity), 0)::integer as request_amount
          from public.equipment_purchase_requests r
          left join public.equipment_purchase_request_items ri on ri.request_id = r.id
          left join public.equipment e on e.id = ri.equipment_id
          where r.status = 'pending'
          group by r.id, coalesce(r.requested_at, r.created_at)
        ) requests
      ) pending_requests

      union all

      select
        'equipment-request-in-progress'::text as id,
        'equipmentRequestInProgress'::text as kind,
        '裝備請購處理中'::text as title,
        format('%s 筆裝備加購已核准或可領取，預估合計 $%s。', item_count, total_amount) as body,
        item_count,
        total_amount,
        'warning'::text as severity,
        case
          when latest_id is not null then format('/fees?tab=equipment&highlight_id=%s', latest_id)
          else '/fees?tab=equipment'::text
        end as link,
        coalesce(latest_created_at, now()) as created_at,
        2 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(request_amount), 0)::integer as total_amount,
          (array_agg(id::text order by created_at desc))[1] as latest_id,
          max(created_at) as latest_created_at
        from (
          select
            r.id,
            coalesce(r.ready_at, r.approved_at, r.updated_at, r.requested_at, r.created_at) as created_at,
            coalesce(sum(coalesce(ri.unit_price_snapshot, e.purchase_price, 0) * ri.quantity), 0)::integer as request_amount
          from public.equipment_purchase_requests r
          left join public.equipment_purchase_request_items ri on ri.request_id = r.id
          left join public.equipment e on e.id = ri.equipment_id
          where r.status in ('approved', 'ready_for_pickup')
          group by r.id, coalesce(r.ready_at, r.approved_at, r.updated_at, r.requested_at, r.created_at)
        ) requests
      ) active_requests

      union all

      select
        'monthly-unpaid'::text as id,
        'monthlyUnpaid'::text as kind,
        '月費待追蹤'::text as title,
        format('%s 位月費成員在 %s 尚未標記已繳，已建檔金額合計 $%s。', item_count, v_monthly_period, total_amount) as body,
        item_count,
        total_amount,
        'warning'::text as severity,
        '/fees?tab=monthly'::text as link,
        coalesce(latest_created_at, now()) as created_at,
        2 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(case when mf.id is null then 0 else coalesce(mf.payable_amount, 0) end), 0)::integer as total_amount,
          max(coalesce(mf.updated_at, mf.created_at)) as latest_created_at
        from public.team_members_safe tm
        left join public.monthly_fees mf
          on mf.member_id = tm.id
         and mf.year_month = v_monthly_period
        where public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'monthly'
          and tm.status is distinct from '退隊'
          and tm.status is distinct from '離隊'
          and coalesce(tm.is_inactive_or_graduated, false) = false
          and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')
      ) monthly_unpaid

      union all

      select
        'quarterly-unpaid'::text as id,
        'quarterlyUnpaid'::text as kind,
        '球員季費待追蹤'::text as title,
        format('%s 位球員在 %s 尚未標記已繳，已建檔金額合計 $%s。', item_count, v_quarterly_period, total_amount) as body,
        item_count,
        total_amount,
        'warning'::text as severity,
        '/fees?tab=quarterly'::text as link,
        coalesce(latest_created_at, now()) as created_at,
        2 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(case when qf.id is null then 0 else coalesce(qf.amount, 0) end), 0)::integer as total_amount,
          max(coalesce(qf.updated_at, qf.created_at)) as latest_created_at
        from public.team_members_safe tm
        left join lateral (
          select
            quarterly_fees.id,
            quarterly_fees.status,
            quarterly_fees.amount,
            quarterly_fees.created_at,
            quarterly_fees.updated_at
          from public.quarterly_fees
          where quarterly_fees.year_quarter = v_quarterly_period
            and (
              quarterly_fees.member_id = tm.id
              or tm.id = any(coalesce(quarterly_fees.member_ids, array[]::uuid[]))
            )
          order by coalesce(quarterly_fees.updated_at, quarterly_fees.created_at) desc
          limit 1
        ) qf on true
        where public.get_effective_payment_billing_mode(tm.role::text, tm.fee_billing_mode::text) = 'quarterly'
          and tm.status is distinct from '退隊'
          and tm.status is distinct from '離隊'
          and coalesce(tm.is_inactive_or_graduated, false) = false
          and coalesce(qf.status, 'unpaid') not in ('paid', 'approved')
      ) quarterly_unpaid

      union all

      select
        'equipment-unpaid'::text as id,
        'equipmentUnpaid'::text as kind,
        '裝備款項待追蹤'::text as title,
        format('%s 筆已領取裝備尚未付款，合計 $%s。', item_count, total_amount) as body,
        item_count,
        total_amount,
        'info'::text as severity,
        '/fees?tab=equipment&section=equipment-unpaid'::text as link,
        coalesce(latest_created_at, now()) as created_at,
        3 as severity_rank
      from (
        select
          count(*)::integer as item_count,
          coalesce(sum(coalesce(t.unit_price, e.purchase_price, 0) * t.quantity), 0)::integer as total_amount,
          (array_agg(r.id::text order by t.created_at desc) filter (where r.id is not null))[1] as latest_request_id,
          max(t.created_at) as latest_created_at
        from public.equipment_transactions t
        join public.equipment e on e.id = t.equipment_id
        left join public.equipment_purchase_request_items ri on ri.id = t.request_item_id
        left join public.equipment_purchase_requests r on r.id = ri.request_id
        where t.transaction_type = 'purchase'
          and coalesce(t.payment_status, 'unpaid') = 'unpaid'
          and (t.request_item_id is null or r.status = 'picked_up')
      ) equipment_unpaid
    ) all_items
    where item_count > 0
  ),
  summary as (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id,
            'kind', kind,
            'title', title,
            'body', body,
            'count', item_count,
            'amount', total_amount,
            'severity', severity,
            'link', link,
            'created_at', created_at
          )
          order by severity_rank, created_at desc
        ),
        '[]'::jsonb
      ) as items,
      coalesce(sum(item_count), 0)::integer as total_count,
      coalesce(sum(total_amount), 0)::integer as total_amount
    from reminder_items
  )
  select jsonb_build_object(
    'items', summary.items,
    'total_count', summary.total_count,
    'total_amount', summary.total_amount,
    'generated_at', now(),
    'monthly_period', v_monthly_period,
    'quarterly_period', v_quarterly_period
  )
  into v_snapshot
  from summary;

  return coalesce(v_snapshot, jsonb_build_object(
    'items', '[]'::jsonb,
    'total_count', 0,
    'total_amount', 0,
    'generated_at', now(),
    'monthly_period', v_monthly_period,
    'quarterly_period', v_quarterly_period
  ));
end;
$$;

revoke all on function public.get_effective_payment_billing_mode(text, text) from public;
revoke all on function public.get_monthly_fee_calculation_type(text, text) from public;
revoke all on function public.list_my_payment_members() from public;
revoke all on function public.get_fee_management_reminders() from public;

grant execute on function public.get_effective_payment_billing_mode(text, text) to authenticated, service_role;
grant execute on function public.get_monthly_fee_calculation_type(text, text) to authenticated, service_role;
grant execute on function public.list_my_payment_members() to authenticated, service_role;
grant execute on function public.get_fee_management_reminders() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
