begin;

-- member_id owns the amount; member_ids is family/payment context. Prefer an
-- individual's record for the same quarter, retaining legacy shared history
-- only when that member has no individual record. Never rewrite stored money.
create schema if not exists private;
create or replace function private.quarterly_fee_matches_member(
  p_owner_id uuid,
  p_family_ids uuid[],
  p_period_key text,
  p_member_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(p_owner_id = p_member_id, false)
    or (
      p_member_id = any(coalesce(p_family_ids, array[]::uuid[]))
      and not exists (
        select 1 from public.quarterly_fees own_fee
        where own_fee.member_id = p_member_id
          and own_fee.year_quarter = p_period_key
      )
    );
$$;

revoke all on function private.quarterly_fee_matches_member(uuid, uuid[], text, uuid)
  from public, anon, authenticated;

-- Patch only ownership predicates in the deployed definitions. This preserves
-- later auth, billing, opening-period and joined-date fixes. Fail atomically if
-- the expected body has drifted; repeated application is safe.
do $migration$
declare
  patch record;
  definition text;
  occurrences integer;
begin
  for patch in
    select * from (values
      (
        'public.get_my_payment_records(uuid)',
        $old$qf.member_id = p_member_id
        or p_member_id = any(coalesce(qf.member_ids, array[]::uuid[]))$old$,
        $new$private.quarterly_fee_matches_member(
          qf.member_id, qf.member_ids, qf.year_quarter::text, p_member_id
        )$new$
      ),
      (
        'public.get_my_payment_submission_estimate(uuid,text)',
        $old$quarterly_fees.member_id = linked_member.member_id
      or linked_member.member_id = any(coalesce(quarterly_fees.member_ids, array[]::uuid[]))$old$,
        $new$private.quarterly_fee_matches_member(
        quarterly_fees.member_id, quarterly_fees.member_ids,
        quarterly_fees.year_quarter::text, linked_member.member_id
      )$new$
      ),
      (
        'public.create_my_payment_submission(uuid,text,integer,text,text,date,text,integer,integer,text)',
        $old$qf.member_id = p_member_id or p_member_id = any(coalesce(qf.member_ids, array[]::uuid[]))$old$,
        $new$private.quarterly_fee_matches_member(qf.member_id, qf.member_ids, qf.year_quarter::text, p_member_id)$new$
      ),
      (
        'public.get_my_home_snapshot(date)',
        $old$tm.id = qf.member_id
          or tm.id = any(coalesce(qf.member_ids, array[]::uuid[]))$old$,
        $new$private.quarterly_fee_matches_member(
            qf.member_id, qf.member_ids, qf.year_quarter::text, tm.id
          )$new$
      ),
      (
        'public.get_fee_management_reminders()',
        $old$quarterly_fees.member_id = tm.id
              or tm.id = any(coalesce(quarterly_fees.member_ids, array[]::uuid[]))$old$,
        $new$private.quarterly_fee_matches_member(
                quarterly_fees.member_id, quarterly_fees.member_ids,
                quarterly_fees.year_quarter::text, tm.id
              )$new$
      ),
      (
        'public.upsert_quarterly_fee_compensation_drafts(text,date)',
        $old$qf.member_id = qm.id
            or qm.id = any(coalesce(qf.member_ids, array[]::uuid[]))$old$,
        $new$private.quarterly_fee_matches_member(
              qf.member_id, qf.member_ids, qf.year_quarter::text, qm.id
            )$new$
      ),
      -- Approval must never take ownership of a sibling's record. If only a
      -- shared legacy row exists, write a new individual row and keep history.
      (
        'public.review_profile_payment_submission(uuid,text,integer,text)',
        $old$qf.member_id = v_item.member_id or v_item.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))$old$,
        $new$qf.member_id = v_item.member_id /* quarterly owner only */$new$
      ),
      (
        'public.review_profile_payment_submission(uuid,text,integer,text)',
        $old$qf.member_id = v_submission.member_id or v_submission.member_id = any(coalesce(qf.member_ids, array[]::uuid[]))$old$,
        $new$qf.member_id = v_submission.member_id /* quarterly owner only */$new$
      )
    ) as patches(signature, old_text, new_text)
  loop
    definition := replace(pg_get_functiondef(patch.signature::regprocedure), E'\r\n', E'\n');
    occurrences := (length(definition) - length(replace(definition, patch.old_text, '')))
      / length(patch.old_text);
    if occurrences = 1 then
      execute replace(definition, patch.old_text, patch.new_text);
    elsif occurrences = 0 and position(patch.new_text in definition) > 0 then
      continue;
    else
      raise exception 'Quarterly ownership patch mismatch for % (% matches)', patch.signature, occurrences;
    end if;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
