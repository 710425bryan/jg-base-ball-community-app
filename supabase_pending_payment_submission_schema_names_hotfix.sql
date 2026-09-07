-- Apply AFTER supabase_pending_payment_submission_self_service_migration.sql.
-- Correct deployed relation/column names only; preserve payment data and authorization.
begin;

create or replace function public.list_my_pending_payment_submissions(p_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or public.current_profile_role() is null then
    raise exception '登入狀態已失效，請重新登入。' using errcode = '42501';
  end if;

  with headers as (
    select 'membership'::text as kind, to_jsonb(s) as data
    from public.profile_payment_submissions s
    where s.profile_id = auth.uid() and s.status = 'pending_review' and s.reviewed_at is null
    union all
    select 'equipment', to_jsonb(s) from public.equipment_payment_submissions s
    where s.profile_id = auth.uid() and s.status = 'pending_review' and s.reviewed_at is null
    union all
    select 'match', to_jsonb(s) from public.match_payment_submissions s
    where s.profile_id = auth.uid() and s.status = 'pending_review' and s.reviewed_at is null
  ), lines as (
    select h.kind, h.data, coalesce(item_data.items, jsonb_build_array(jsonb_build_object(
      'id', h.data->>'id', 'member_id', h.data->>'member_id',
      'label', tm.name || '｜' || case h.kind
        when 'membership' then h.data->>'period_key'
        when 'equipment' then coalesce((
          select string_agg(e.name || coalesce(' ' || t.size, '') || ' × ' || t.quantity, '、' order by t.id)
          from public.equipment_payment_submission_items i
          join public.equipment_transactions t on t.id = i.transaction_id
          join public.equipment e on e.id = t.equipment_id
          where i.submission_id = (h.data->>'id')::uuid
        ), '裝備付款')
        else coalesce((
          select string_agg(t.match_name_snapshot || ' ' || t.match_date_snapshot::text, '、' order by t.id)
          from public.match_payment_submission_items i
          join public.match_fee_items t on t.id = i.match_fee_item_id
          where i.submission_id = (h.data->>'id')::uuid
        ), '比賽費用') end,
      'expected_amount', case when h.kind = 'membership'
        then (h.data->>'expected_amount')::integer else (h.data->>'amount')::integer end,
      'balance_amount', coalesce((h.data->>'balance_amount')::integer, 0),
      'reported_external_amount', coalesce((h.data->>'reported_external_amount')::integer,
        greatest((h.data->>'amount')::integer - coalesce((h.data->>'balance_amount')::integer, 0), 0)),
      'available_balance', public.get_player_balance_unchecked(tm.id)
    ))) as items
    from headers h
    join public.team_members tm on tm.id = (h.data->>'member_id')::uuid
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id', si.id, 'member_id', si.member_id, 'label', im.name || '｜' || si.period_key,
        'expected_amount', si.expected_amount, 'balance_amount', coalesce(si.balance_amount, 0),
        'reported_external_amount', coalesce(si.reported_external_amount, greatest(si.amount - coalesce(si.balance_amount, 0), 0)),
        'available_balance', public.get_player_balance_unchecked(si.member_id)
      ) order by im.name, si.id) as items
      from public.profile_payment_submission_items si
      join public.team_members im on im.id = si.member_id
      where h.kind = 'membership' and si.submission_id = (h.data->>'id')::uuid
    ) item_data on true
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.data->>'id', 'kind', l.kind,
    'label', case l.kind when 'membership' then '月／季費' when 'equipment' then '裝備款' else '比賽費' end,
    'payment_method', l.data->>'payment_method', 'account_last_5', l.data->>'account_last_5',
    'remittance_date', l.data->>'remittance_date', 'note', l.data->>'note',
    'amount_mismatch_reason', l.data->>'amount_mismatch_reason',
    'updated_at', l.data->>'updated_at', 'items', l.items
  ) order by l.data->>'updated_at' desc), '[]'::jsonb) into v_result
  from lines l
  join public.profiles p on p.id = auth.uid()
  where (l.data->>'member_id')::uuid = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
    and not exists (
      select 1 from jsonb_array_elements(l.items) i
      where not ((i->>'member_id')::uuid = any(coalesce(p.linked_team_member_ids, array[]::uuid[])))
    )
    and (p_member_id is null or exists (
      select 1 from jsonb_array_elements(l.items) i where (i->>'member_id')::uuid = p_member_id
    ));
  return v_result;
end;
$$;

revoke all on function public.list_my_pending_payment_submissions(uuid) from public, anon;
grant execute on function public.list_my_pending_payment_submissions(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
