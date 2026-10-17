begin;

-- Production had 637,607 updates on 283 match_fee_items rows (2026-10-17
-- read-only statistics). Every sync rewrote each eligible unpaid/cancelled row
-- with updated_at = now() even when nothing changed, and the triggers ran on
-- every UPDATE that merely listed the columns. This migration keeps all fee
-- rules and only skips work that cannot change a row:
--   1. the sync upsert no longer rewrites identical rows (row versions used by
--      single-match exemption stay stable);
--   2. the match trigger returns early when no watched column value changed;
--   3. the leave trigger ignores updates that do not change who/when, and only
--      resyncs matches that involve the affected member.
-- Pending/paid rows were already excluded and remain untouched.

do $migration$
declare
  v_oid regprocedure := to_regprocedure('public.sync_match_fee_items_for_match(uuid)');
  v_sql text;
  v_old text := E'    where match_fee_items.payment_status in (''unpaid'', ''cancelled'')\n'
    || E'      and match_fee_items.payment_submission_id is null;';
  v_new text := E'    where match_fee_items.payment_status in (''unpaid'', ''cancelled'')\n'
    || E'      and match_fee_items.payment_submission_id is null\n'
    || E'      -- match-fee-sync-noop-guard: skip rows the SET list would not change.\n'
    || E'      and (\n'
    || E'        match_fee_items.member_name_snapshot is distinct from excluded.member_name_snapshot\n'
    || E'        or match_fee_items.match_name_snapshot is distinct from excluded.match_name_snapshot\n'
    || E'        or match_fee_items.tournament_name_snapshot is distinct from excluded.tournament_name_snapshot\n'
    || E'        or match_fee_items.match_date_snapshot is distinct from excluded.match_date_snapshot\n'
    || E'        or match_fee_items.match_time_snapshot is distinct from excluded.match_time_snapshot\n'
    || E'        or match_fee_items.category_group_snapshot is distinct from excluded.category_group_snapshot\n'
    || E'        or match_fee_items.fee_month is distinct from excluded.fee_month\n'
    || E'        or match_fee_items.payment_status is distinct from\n'
    || E'          (case when match_fee_items.is_exempt then ''cancelled'' else ''unpaid'' end)\n'
    || E'        or match_fee_items.cancelled_reason is distinct from\n'
    || E'          (case when match_fee_items.is_exempt then ''單場免繳'' end)\n'
    || E'        or (match_fee_items.is_exempt is not true and match_fee_items.cancelled_at is not null)\n'
    || E'        or (match_fee_items.is_exempt is not true\n'
    || E'          and match_fee_items.amount is distinct from excluded.amount\n'
    || E'          and not exists (\n'
    || E'            select 1\n'
    || E'            from public.match_payment_submission_items history_link\n'
    || E'            where history_link.match_fee_item_id = match_fee_items.id\n'
    || E'          ))\n'
    || E'      );';
begin
  if v_oid is null then
    raise exception 'Required sync_match_fee_items_for_match(uuid) is missing';
  end if;
  v_sql := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  if position('-- match-fee-sync-noop-guard' in v_sql) > 0 then
    return;
  end if;
  if position('-- match-cancellation-billing-lock-order' in v_sql) = 0
    or (length(v_sql) - length(replace(v_sql, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Unexpected sync_match_fee_items_for_match definition; no-op guard migration aborted';
  end if;
  execute replace(v_sql, v_old, v_new);
end;
$migration$;

-- Same watched columns as the trigger's UPDATE OF list.
create or replace function public.sync_match_fee_items_after_match_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE'
    and (old.match_fee_amount, old.match_name, old.tournament_name, old.match_date,
      old.match_time, old.category_group, old.players, old.absent_players)
      is not distinct from
      (new.match_fee_amount, new.match_name, new.tournament_name, new.match_date,
      new.match_time, new.category_group, new.players, new.absent_players) then
    return new;
  end if;
  perform public.sync_match_fee_items_for_match(new.id);
  return new;
end;
$function$;

-- Fee eligibility only reads user_id, start_date, end_date and
-- leave_time_segment, and a leave only changes the affected member's own row.
-- A match needs a resync when that member already has a fee row there, or the
-- match charges a fee and lists the member as a player.
create or replace function public.sync_match_fee_items_after_leave_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_start_date date;
  v_end_date date;
  v_member_ids uuid[];
  v_match record;
begin
  if tg_op = 'UPDATE'
    and (old.user_id, old.start_date, old.end_date, old.leave_time_segment)
      is not distinct from (new.user_id, new.start_date, new.end_date, new.leave_time_segment) then
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_start_date := old.start_date;
    v_end_date := coalesce(old.end_date, old.start_date);
    v_member_ids := array[old.user_id];
  elsif tg_op = 'UPDATE' then
    v_start_date := least(old.start_date, new.start_date);
    v_end_date := greatest(coalesce(old.end_date, old.start_date), coalesce(new.end_date, new.start_date));
    v_member_ids := array[old.user_id, new.user_id];
  else
    v_start_date := new.start_date;
    v_end_date := coalesce(new.end_date, new.start_date);
    v_member_ids := array[new.user_id];
  end if;

  for v_match in
    select m.id
    from public.matches m
    where m.match_date between v_start_date and v_end_date
      and (
        exists (
          select 1
          from public.match_fee_items fi
          where fi.match_id = m.id
            and fi.member_id = any(v_member_ids)
        )
        or (
          coalesce(m.match_fee_amount, 0) > 0
          and exists (
            select 1
            from public.team_members tm
            join public.split_match_fee_player_names(m.players) pn
              on public.normalize_match_fee_player_name(pn.player_name)
                = public.normalize_match_fee_player_name(tm.name::text)
            where tm.id = any(v_member_ids)
          )
        )
      )
    order by m.id
  loop
    perform public.sync_match_fee_items_for_match(v_match.id);
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';

commit;
