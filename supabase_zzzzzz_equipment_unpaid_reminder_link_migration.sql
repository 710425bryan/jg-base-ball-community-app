-- Repair and replace get_fee_management_reminders() without dynamic SQL.
-- If the previous attempt left the SQL editor in an aborted transaction, this
-- rollback is harmless when no transaction is active and clears the session.
rollback;

begin;

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
        U&'\500B\4EBA\56DE\5831\5F85\78BA\8A8D'::text as title,
        format(U&'%s \7B46\500B\4EBA\56DE\5831\4ED8\6B3E\5F85\78BA\8A8D\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
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
        U&'\88DD\5099\4ED8\6B3E\5F85\78BA\8A8D'::text as title,
        format(U&'%s \7B46\88DD\5099\4ED8\6B3E\56DE\5831\5F85\78BA\8A8D\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
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
        U&'\88DD\5099\8ACB\8CFC\5F85\5BE9\6838'::text as title,
        format(U&'%s \7B46\88DD\5099\8ACB\8CFC\5F85\5BE9\6838\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
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
        U&'\88DD\5099\8ACB\8CFC\9032\884C\4E2D'::text as title,
        format(U&'%s \7B46\88DD\5099\8ACB\8CFC\5DF2\6838\51C6\6216\5F85\9818\53D6\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
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
        U&'\6821\968A\6708\8CBB\672A\4ED8\6B3E'::text as title,
        format(U&'%s \7B46\6821\968A\6708\8CBB\5728 %s \5C1A\672A\5B8C\6210\4ED8\6B3E\FF0C\5408\8A08 $%s\3002', item_count, v_monthly_period, total_amount) as body,
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
        where tm.role = U&'\6821\968A'
          and tm.status is distinct from U&'\9000\968A'
          and tm.status is distinct from U&'\505C\6B0A'
          and coalesce(mf.status, 'unpaid') not in ('paid', 'approved')
      ) monthly_unpaid

      union all

      select
        'quarterly-unpaid'::text as id,
        'quarterlyUnpaid'::text as kind,
        U&'\7403\54E1\5B63\8CBB\672A\4ED8\6B3E'::text as title,
        format(U&'%s \7B46\7403\54E1\5B63\8CBB\5728 %s \5C1A\672A\5B8C\6210\4ED8\6B3E\FF0C\5408\8A08 $%s\3002', item_count, v_quarterly_period, total_amount) as body,
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
        where tm.role = U&'\7403\54E1'
          and tm.status is distinct from U&'\9000\968A'
          and tm.status is distinct from U&'\505C\6B0A'
          and coalesce(qf.status, 'unpaid') not in ('paid', 'approved')
      ) quarterly_unpaid

      union all

      select
        'equipment-unpaid'::text as id,
        'equipmentUnpaid'::text as kind,
        U&'\88DD\5099\6B3E\9805\5F85\8FFD\8E64'::text as title,
        format(U&'\5C1A\672A\4ED8\6B3E\FF1A%s \7B46\FF0C\5408\8A08 $%s\3002', item_count, total_amount) as body,
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

revoke all on function public.get_fee_management_reminders() from public;
revoke all on function public.get_fee_management_reminders() from anon;
grant execute on function public.get_fee_management_reminders() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
