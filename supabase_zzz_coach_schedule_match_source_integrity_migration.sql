begin;

-- coach_schedule_events.source_id is polymorphic, so a normal foreign key cannot
-- reference matches directly. Enforce the match / training-class branch with
-- guarded triggers instead.
create or replace function public.validate_coach_schedule_match_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_level text;
  v_expected_source_type text;
begin
  if new.source_type not in ('match', 'training_class') then
    return new;
  end if;

  if new.source_id is null then
    raise exception using
      errcode = '23503',
      message = 'Coach schedule match source_id is required';
  end if;

  select m.match_level::text
  into v_match_level
  from public.matches m
  where m.id = new.source_id
  for key share;

  if not found then
    raise exception using
      errcode = '23503',
      message = format('Coach schedule match source %s does not exist', new.source_id);
  end if;

  v_expected_source_type := case
    when v_match_level = '特訓課' then 'training_class'
    else 'match'
  end;

  if new.source_type <> v_expected_source_type then
    raise exception using
      errcode = '23514',
      message = format(
        'Coach schedule source type %s does not match source %s (%s)',
        new.source_type,
        new.source_id,
        v_expected_source_type
      );
  end if;

  return new;
end;
$$;

revoke all on function public.validate_coach_schedule_match_source() from public;
revoke all on function public.validate_coach_schedule_match_source() from anon;
revoke all on function public.validate_coach_schedule_match_source() from authenticated;

drop trigger if exists coach_schedule_validate_match_source_before_write
  on public.coach_schedule_events;

create trigger coach_schedule_validate_match_source_before_write
before insert or update of source_type, source_id
on public.coach_schedule_events
for each row
execute function public.validate_coach_schedule_match_source();

create or replace function public.cleanup_coach_schedule_events_after_match_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.coach_schedule_events e
  where e.source_type in ('match', 'training_class')
    and e.source_id = old.id;

  return old;
end;
$$;

revoke all on function public.cleanup_coach_schedule_events_after_match_delete() from public;
revoke all on function public.cleanup_coach_schedule_events_after_match_delete() from anon;
revoke all on function public.cleanup_coach_schedule_events_after_match_delete() from authenticated;

drop trigger if exists coach_schedule_cleanup_after_match_delete
  on public.matches;

create trigger coach_schedule_cleanup_after_match_delete
after delete
on public.matches
for each row
execute function public.cleanup_coach_schedule_events_after_match_delete();

create or replace function public.sync_coach_schedule_match_source_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_source_type text;
begin
  if old.match_level is not distinct from new.match_level then
    return new;
  end if;

  v_expected_source_type := case
    when new.match_level = '特訓課' then 'training_class'
    else 'match'
  end;

  update public.coach_schedule_events e
  set
    source_type = v_expected_source_type,
    updated_at = timezone('utc', now())
  where e.source_id = new.id
    and e.source_type in ('match', 'training_class')
    and e.source_type <> v_expected_source_type;

  return new;
end;
$$;

revoke all on function public.sync_coach_schedule_match_source_type() from public;
revoke all on function public.sync_coach_schedule_match_source_type() from anon;
revoke all on function public.sync_coach_schedule_match_source_type() from authenticated;

drop trigger if exists coach_schedule_sync_match_source_type_after_update
  on public.matches;

create trigger coach_schedule_sync_match_source_type_after_update
after update of match_level
on public.matches
for each row
execute function public.sync_coach_schedule_match_source_type();

-- If a previous deployment already produced both source types for one match,
-- keep the row matching the current match type before normalizing the rest.
delete from public.coach_schedule_events stale
using public.matches m
where stale.source_id = m.id
  and stale.source_type in ('match', 'training_class')
  and stale.source_type <> case when m.match_level = '特訓課' then 'training_class' else 'match' end
  and exists (
    select 1
    from public.coach_schedule_events current_event
    where current_event.source_id = m.id
      and current_event.source_type = case
        when m.match_level = '特訓課' then 'training_class'
        else 'match'
      end
  );

-- Preserve saved assignments when only the source type became stale.
update public.coach_schedule_events e
set
  source_type = case when m.match_level = '特訓課' then 'training_class' else 'match' end,
  updated_at = timezone('utc', now())
from public.matches m
where e.source_id = m.id
  and e.source_type in ('match', 'training_class')
  and e.source_type <> case when m.match_level = '特訓課' then 'training_class' else 'match' end;

-- Remove orphaned saved schedules. Assignments are removed by the existing
-- coach_schedule_assignments.event_id ON DELETE CASCADE foreign key.
delete from public.coach_schedule_events e
where e.source_type in ('match', 'training_class')
  and (
    e.source_id is null
    or not exists (
      select 1
      from public.matches m
      where m.id = e.source_id
    )
  );

do $$
begin
  if exists (
    select 1
    from public.coach_schedule_events e
    left join public.matches m on m.id = e.source_id
    where e.source_type in ('match', 'training_class')
      and (
        e.source_id is null
        or m.id is null
        or e.source_type <> case when m.match_level = '特訓課' then 'training_class' else 'match' end
      )
  ) then
    raise exception 'Coach schedule match source integrity repair failed';
  end if;
end;
$$;

commit;
