begin;

drop function if exists public.delete_player_point_transactions(uuid[]);

create or replace function public.delete_player_point_transactions(
  p_transaction_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_transaction_ids uuid[];
  v_found_count integer := 0;
  v_blocked_count integer := 0;
  v_deleted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not coalesce(public.has_app_permission('training', 'DELETE'), false) then
    raise exception 'training DELETE permission required';
  end if;

  select array_agg(distinct ids.transaction_id)
  into v_transaction_ids
  from unnest(coalesce(p_transaction_ids, array[]::uuid[])) as ids(transaction_id)
  where ids.transaction_id is not null;

  if v_transaction_ids is null or cardinality(v_transaction_ids) = 0 then
    raise exception 'transaction_ids are required';
  end if;

  with locked_transactions as (
    select ppt.id
    from public.player_point_transactions ppt
    where ppt.id = any(v_transaction_ids)
    for update
  )
  select count(*)
  into v_found_count
  from locked_transactions;

  if v_found_count <> cardinality(v_transaction_ids) then
    raise exception 'some point transactions were not found';
  end if;

  select count(*)
  into v_blocked_count
  from public.player_point_transactions ppt
  where ppt.id = any(v_transaction_ids)
    and (
      ppt.source <> 'manual'
      or ppt.related_session_id is not null
      or ppt.related_registration_id is not null
      or ppt.idempotency_key is not null
    );

  if v_blocked_count > 0 then
    raise exception '只能刪除手動建立的點數紀錄';
  end if;

  with point_delta as (
    select
      ppt.member_id,
      coalesce(sum(ppt.delta), 0)::integer as delta_to_remove
    from public.player_point_transactions ppt
    where ppt.id = any(v_transaction_ids)
    group by ppt.member_id
  )
  select count(*)
  into v_blocked_count
  from point_delta pd
  where public.get_player_point_balance(pd.member_id) - pd.delta_to_remove
    < public.get_player_reserved_training_points(pd.member_id);

  if v_blocked_count > 0 then
    raise exception '刪除後可用點數不足，仍有已錄取保留點數。';
  end if;

  delete from public.player_point_transactions ppt
  where ppt.id = any(v_transaction_ids);

  get diagnostics v_deleted_count = ROW_COUNT;
  return v_deleted_count;
end;
$$;

revoke all on function public.delete_player_point_transactions(uuid[]) from public;
grant execute on function public.delete_player_point_transactions(uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
