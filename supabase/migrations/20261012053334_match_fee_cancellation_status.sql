begin;

-- Add authoritative match status without replacing the existing finance RPC
-- return type. Its sync, billing, snapshots and authorization remain intact.
create or replace function public.list_match_fee_items_by_month_with_match_status(p_fee_month text)
returns table (
  id uuid,
  match_id uuid,
  member_id uuid,
  member_name text,
  member_role text,
  match_name text,
  tournament_name text,
  match_date date,
  match_time text,
  category_group text,
  fee_month text,
  amount integer,
  match_fee_amount integer,
  payment_opened_at timestamptz,
  payment_opened_by_name text,
  has_payment_history boolean,
  payment_status text,
  payment_submission_id uuid,
  payment_submission_status text,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  balance_amount integer,
  paid_at timestamptz,
  cancelled_reason text,
  created_at timestamptz,
  updated_at timestamptz,
  is_exempt boolean,
  match_cancelled_at timestamptz,
  match_cancellation_reason text
)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.current_profile_role() is null then
    raise exception using errcode = '42501', message = '請先以有效帳號登入';
  end if;
  if not (public.has_app_permission('fees', 'VIEW') or public.has_app_permission('fees', 'EDIT')) then
    raise exception using errcode = '42501', message = 'fees VIEW permission required';
  end if;
  return query
  select fees.*, m.cancelled_at, m.cancellation_reason
  from public.list_match_fee_items_by_month(p_fee_month) fees
  left join public.matches m on m.id = fees.match_id
  order by fees.match_date asc nulls last,
    case when substring(fees.match_time from '([0-9]{1,2}:[0-9]{2})') is null then 1 else 0 end,
    lpad(substring(fees.match_time from '([0-9]{1,2}:[0-9]{2})'), 5, '0') asc nulls last,
    fees.match_name asc, fees.member_name asc;
end;
$$;
revoke all on function public.list_match_fee_items_by_month_with_match_status(text) from public, anon;
grant execute on function public.list_match_fee_items_by_month_with_match_status(text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
