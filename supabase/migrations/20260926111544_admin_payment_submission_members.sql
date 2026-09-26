begin;

-- ADMIN may report payments for unlinked players. Other roles still need every
-- member linked. current_profile_role enforces activation and the access window.
-- This helper changes member scope only; amounts, payment state, balance limits,
-- opening periods and the original reporter checks remain in the caller RPCs.
create schema if not exists private;
create or replace function private.can_submit_payment_for_member(p_member_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_member_id is not null
    and public.current_profile_role() is not null
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (
          public.current_profile_role() = 'ADMIN'
          or p_member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))
        )
    );
$$;
revoke all on function private.can_submit_payment_for_member(uuid)
  from public, anon, authenticated;

-- Preserve the current RPC definitions, including the sibling ownership fix.
-- Reject unexpected drift and roll back the entire migration on any mismatch.
do $migration$
declare
  patch record;
  definition text;
  occurrences integer;
begin
  for patch in
    select * from (values
      ('public.create_my_payment_submission(uuid,text,integer,text,text,date,text,integer,integer,text)',
       $old$p_member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))$old$,
       $new$private.can_submit_payment_for_member(p_member_id)$new$),
      ('public.create_my_quarterly_payment_submission(jsonb,text,text,date,text,text)',
       $old$raw.member_id = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))$old$,
       $new$private.can_submit_payment_for_member(raw.member_id)$new$),
      ('public.create_equipment_payment_submission(uuid[],text,text,date,text,integer)',
       $old$v_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))$old$,
       $new$private.can_submit_payment_for_member(v_member_id)$new$),
      ('public.create_match_payment_submission(uuid[],text,text,date,text,integer)',
       $old$v_member_id = any(coalesce(profiles.linked_team_member_ids, array[]::uuid[]))$old$,
       $new$private.can_submit_payment_for_member(v_member_id)$new$),
      ('public.list_my_pending_payment_submissions(uuid)',
       $old$(l.data->>'member_id')::uuid = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))$old$,
       $new$private.can_submit_payment_for_member((l.data->>'member_id')::uuid)$new$),
      ('public.list_my_pending_payment_submissions(uuid)',
       $old$(i->>'member_id')::uuid = any(coalesce(p.linked_team_member_ids, array[]::uuid[]))$old$,
       $new$private.can_submit_payment_for_member((i->>'member_id')::uuid)$new$)
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
      raise exception 'Admin payment member patch mismatch for % (% matches)', patch.signature, occurrences;
    end if;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
commit;
