begin;

create or replace function public.review_profile_payment_submission(
  p_submission_id uuid,
  p_status text,
  p_overpayment_amount integer default 0
)
returns table (
  id uuid,
  member_id uuid,
  member_name text,
  billing_mode text,
  period_key text,
  period_label text,
  amount integer,
  balance_amount integer,
  external_amount integer,
  payment_method text,
  account_last_5 text,
  remittance_date date,
  note text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_submission public.profile_payment_submissions%rowtype;
  v_overpayment_amount integer := greatest(coalesce(p_overpayment_amount, 0), 0);
  v_quarterly_fee_id uuid;
  v_monthly_calculation_type text := 'per_session';
  v_fixed_monthly_fee integer := null;
begin
  if v_user_id is null then
    raise exception 'auth.uid() is null';
  end if;

  if p_status not in ('approved', 'rejected') then
    raise exception 'unsupported review status';
  end if;

  if not public.has_app_permission('fees', 'EDIT') then
    raise exception 'fees EDIT permission required';
  end if;

  select *
  into v_submission
  from public.profile_payment_submissions
  where profile_payment_submissions.id = p_submission_id
    and profile_payment_submissions.status = 'pending_review'
  for update;

  if not found then
    raise exception 'submission not found or already reviewed';
  end if;

  if p_status = 'approved' then
    select
      public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text),
      case
        when public.get_monthly_fee_calculation_type(tm.role::text, tm.fee_billing_mode::text) = 'monthly_fixed'
          then coalesce(fs.monthly_fixed_fee, 2000)
        else null
      end
    into v_monthly_calculation_type, v_fixed_monthly_fee
    from public.team_members tm
    left join public.fee_settings fs
      on fs.member_id = tm.id
    where tm.id = v_submission.member_id
    for update of tm;

    if not found then
      raise exception 'member not found';
    end if;

    if coalesce(v_submission.balance_amount, 0) > public.get_player_balance_unchecked(v_submission.member_id) then
      raise exception 'player balance is not enough';
    end if;

    if coalesce(v_submission.balance_amount, 0) > 0 then
      insert into public.player_balance_transactions (
        member_id,
        delta,
        reason,
        source,
        related_profile_payment_submission_id,
        idempotency_key,
        created_by
      )
      values (
        v_submission.member_id,
        -v_submission.balance_amount,
        format('繳費扣抵 %s', v_submission.period_key),
        'payment_deduction',
        v_submission.id,
        format('profile_payment:%s:balance', v_submission.id),
        v_user_id
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if v_overpayment_amount > 0 then
      insert into public.player_balance_transactions (
        member_id,
        delta,
        reason,
        source,
        related_profile_payment_submission_id,
        idempotency_key,
        created_by
      )
      values (
        v_submission.member_id,
        v_overpayment_amount,
        format('繳費溢繳轉入 %s', v_submission.period_key),
        'overpayment',
        v_submission.id,
        format('profile_payment:%s:overpayment', v_submission.id),
        v_user_id
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if v_submission.billing_mode = 'monthly' then
      insert into public.monthly_fees (
        member_id,
        year_month,
        payable_amount,
        deduction_amount,
        calculation_type,
        fixed_monthly_fee,
        status,
        paid_at,
        payment_method,
        account_last_5,
        remittance_date,
        balance_amount,
        updated_at
      )
      values (
        v_submission.member_id,
        v_submission.period_key,
        v_submission.amount,
        0,
        v_monthly_calculation_type,
        v_fixed_monthly_fee,
        'paid',
        now(),
        v_submission.payment_method,
        v_submission.account_last_5,
        v_submission.remittance_date,
        coalesce(v_submission.balance_amount, 0),
        now()
      )
      on conflict on constraint monthly_fees_member_id_year_month_key do update
      set
        payable_amount = excluded.payable_amount,
        calculation_type = excluded.calculation_type,
        fixed_monthly_fee = excluded.fixed_monthly_fee,
        status = 'paid',
        paid_at = excluded.paid_at,
        payment_method = excluded.payment_method,
        account_last_5 = excluded.account_last_5,
        remittance_date = excluded.remittance_date,
        balance_amount = excluded.balance_amount,
        updated_at = excluded.updated_at;
    elsif v_submission.billing_mode = 'quarterly' then
      select qf.id
      into v_quarterly_fee_id
      from public.quarterly_fees qf
      where qf.year_quarter = v_submission.period_key
        and (
          qf.member_id = v_submission.member_id
          or v_submission.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))
        )
      order by coalesce(qf.updated_at, qf.created_at) desc nulls last
      limit 1;

      if v_quarterly_fee_id is not null then
        update public.quarterly_fees
        set
          amount = v_submission.amount,
          payment_method = v_submission.payment_method,
          account_last_5 = v_submission.account_last_5,
          remittance_date = v_submission.remittance_date,
          balance_amount = coalesce(v_submission.balance_amount, 0),
          status = 'paid',
          paid_at = now(),
          updated_at = now()
        where quarterly_fees.id = v_quarterly_fee_id;
      else
        insert into public.quarterly_fees (
          member_id,
          member_ids,
          year_quarter,
          amount_type,
          amount,
          payment_method,
          account_last_5,
          remittance_date,
          payment_items,
          balance_amount,
          status,
          paid_at,
          updated_at
        )
        values (
          v_submission.member_id,
          array[v_submission.member_id],
          v_submission.period_key,
          'other',
          v_submission.amount,
          v_submission.payment_method,
          v_submission.account_last_5,
          v_submission.remittance_date,
          '["自助繳費"]'::jsonb,
          coalesce(v_submission.balance_amount, 0),
          'paid',
          now(),
          now()
        );
      end if;
    end if;
  end if;

  update public.profile_payment_submissions
  set
    status = p_status,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where profile_payment_submissions.id = p_submission_id;

  return query
  select *
  from public.list_my_payment_submissions(v_submission.member_id) submissions
  where submissions.id = p_submission_id;
end;
$$;

revoke all on function public.review_profile_payment_submission(uuid, text, integer) from public;
grant execute on function public.review_profile_payment_submission(uuid, text, integer) to authenticated, service_role;

commit;
