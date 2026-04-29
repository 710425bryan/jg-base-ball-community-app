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
          when latest_id is not null then format('/fees?tab=equipment&highlight_submission_id=%s', latest_id)
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
        '校隊月費待追蹤'::text as title,
        format('%s 位校隊成員在 %s 尚未標記已繳，已建檔金額合計 $%s。', item_count, v_monthly_period, total_amount) as body,
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
        where tm.role = '校隊'
          and tm.status is distinct from '退隊'
          and tm.status is distinct from '離隊'
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
        where tm.role = '球員'
          and tm.status is distinct from '退隊'
          and tm.status is distinct from '離隊'
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
        case
          when latest_request_id is not null then format('/fees?tab=equipment&highlight_id=%s', latest_request_id)
          else '/fees?tab=equipment'::text
        end as link,
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

revoke all on function public.get_fee_management_reminders() from public;
grant execute on function public.get_fee_management_reminders() to authenticated, service_role;

create or replace function public.get_notification_feed(p_limit integer default 10)
returns table (
  id text,
  source text,
  title text,
  body text,
  created_at timestamptz,
  link text,
  highlight_member_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_permissions text[] := '{}'::text[];
  v_is_admin boolean := false;
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = v_user_id;

  v_is_admin := v_role = 'ADMIN';

  if not v_is_admin and v_role is not null then
    select coalesce(array_agg(arp.feature), '{}'::text[])
    into v_permissions
    from public.app_role_permissions arp
    where arp.role_key = v_role
      and arp.action = 'VIEW';
  end if;

  return query
  with limit_settings as (
    select v_limit as feed_limit
  ),
  leave_items as (
    select
      lr.id::text as id,
      'leave'::text as source,
      format('[新增假單] %s 的%s', coalesce(tm.name, '未知球員'), coalesce(lr.leave_type, '假單')) as title,
      format(
        E'日期：%s ~ %s\n原因：%s',
        lr.start_date,
        lr.end_date,
        coalesce(nullif(lr.reason, ''), '無')
      ) as body,
      lr.created_at,
      format('/leave-requests?highlight_leave_id=%s', lr.id::text) as link,
      null::uuid as highlight_member_id
    from public.leave_requests lr
    left join public.team_members tm on tm.id = lr.user_id
    where v_is_admin or 'leave_requests' = any(v_permissions)
    order by lr.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  member_items as (
    select
      tm.id::text as id,
      'member'::text as source,
      format('[新進通知] 歡迎 %s 入隊！', coalesce(tm.name, '未知球員')) as title,
      format('剛從表單收到了 %s (%s) 的球員資料。', coalesce(tm.name, '未知球員'), coalesce(tm.role, '球員')) as body,
      tm.created_at,
      '/players'::text as link,
      null::uuid as highlight_member_id
    from public.team_members tm
    where v_is_admin or 'players' = any(v_permissions)
    order by tm.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  join_items as (
    select
      ji.id::text as id,
      'join'::text as source,
      format('[入隊詢問] 收到來自 %s 的聯絡', coalesce(ji.parent_name, '未知家長')) as title,
      format('電話: %s。請盡快與家長聯繫！', coalesce(ji.phone, '-')) as body,
      ji.created_at,
      '/join-inquiries'::text as link,
      null::uuid as highlight_member_id
    from public.join_inquiries ji
    where v_is_admin or 'join_inquiries' = any(v_permissions)
    order by ji.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  match_items as (
    select
      pde.id::text as id,
      'match'::text as source,
      coalesce(nullif(pde.title, ''), '明日賽事提醒') as title,
      coalesce(nullif(pde.body, ''), '明天有比賽，請查看賽事資訊。') as body,
      pde.created_at,
      coalesce(
        nullif(pde.url, ''),
        case
          when pde.match_id is not null then format('/match-records?match_id=%s', pde.match_id::text)
          else '/match-records'
        end
      ) as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'matches'
      and pde.action = 'REMINDER'
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  announcement_items as (
    select
      pde.event_key as id,
      'announcement'::text as source,
      coalesce(nullif(pde.title, ''), '系統公告') as title,
      coalesce(nullif(pde.body, ''), '請查看最新公告內容。') as body,
      pde.created_at,
      coalesce(nullif(pde.url, ''), '/announcements') as link,
      null::uuid as highlight_member_id
    from public.push_dispatch_events pde
    where pde.feature = 'announcements'
      and pde.action = 'VIEW'
      and (v_is_admin or 'announcements' = any(v_permissions))
    order by pde.created_at desc
    limit (select feed_limit from limit_settings)
  ),
  fee_reminder_snapshot as (
    select public.get_fee_management_reminders() as snapshot
    where v_is_admin or 'fees' = any(v_permissions)
  ),
  fee_reminder_items as (
    select
      coalesce(reminder.item->>'id', reminder.item->>'kind') as id,
      case
        when reminder.item->>'kind' in (
          'equipmentPaymentPending',
          'equipmentRequestPending',
          'equipmentRequestInProgress',
          'equipmentUnpaid'
        ) then 'equipment'
        else 'fee'
      end::text as source,
      coalesce(nullif(reminder.item->>'title', ''), '收費待辦提醒') as title,
      coalesce(nullif(reminder.item->>'body', ''), '收費管理有待處理事項。') as body,
      coalesce(nullif(reminder.item->>'created_at', '')::timestamptz, now()) as created_at,
      coalesce(nullif(reminder.item->>'link', ''), '/fees') as link,
      null::uuid as highlight_member_id
    from fee_reminder_snapshot
    cross join lateral jsonb_array_elements(
      coalesce(fee_reminder_snapshot.snapshot->'items', '[]'::jsonb)
    ) as reminder(item)
    limit (select feed_limit from limit_settings)
  )
  select
    feed.id,
    feed.source,
    feed.title,
    feed.body,
    feed.created_at,
    feed.link,
    feed.highlight_member_id
  from (
    select * from leave_items
    union all
    select * from member_items
    union all
    select * from join_items
    union all
    select * from match_items
    union all
    select * from announcement_items
    union all
    select * from fee_reminder_items
  ) feed
  order by feed.created_at desc
  limit (select feed_limit from limit_settings);
end;
$$;

revoke all on function public.get_notification_feed(integer) from public;
grant execute on function public.get_notification_feed(integer) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
