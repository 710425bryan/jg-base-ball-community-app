begin;

create or replace function public.sync_coach_schedule_events_from_training_location_venue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.training_location_sessions%rowtype;
begin
  select *
  into v_session
  from public.training_location_sessions
  where id = new.session_id;

  if not found then
    return new;
  end if;

  update public.coach_schedule_events
  set
    schedule_date = coalesce(new.training_date, v_session.training_date)::date,
    start_time = coalesce(nullif(btrim(new.start_time), ''), nullif(btrim(v_session.start_time), ''), '09:00'),
    end_time = coalesce(nullif(btrim(new.end_time), ''), nullif(btrim(v_session.end_time), ''), '12:30'),
    title = coalesce(nullif(btrim(new.title), ''), nullif(btrim(v_session.title), ''), '場地訓練'),
    location = nullif(btrim(new.venue_name), ''),
    location_url = nullif(btrim(new.venue_maps_url), ''),
    legacy_coaches = null,
    updated_by = coalesce(auth.uid(), public.coach_schedule_events.updated_by),
    updated_at = timezone('utc', now())
  where source_type = 'training_location'
    and source_id = v_session.id
    and source_venue_id = new.id
    and (
      schedule_date is distinct from coalesce(new.training_date, v_session.training_date)::date
      or start_time is distinct from coalesce(nullif(btrim(new.start_time), ''), nullif(btrim(v_session.start_time), ''), '09:00')
      or end_time is distinct from coalesce(nullif(btrim(new.end_time), ''), nullif(btrim(v_session.end_time), ''), '12:30')
      or title is distinct from coalesce(nullif(btrim(new.title), ''), nullif(btrim(v_session.title), ''), '場地訓練')
      or location is distinct from nullif(btrim(new.venue_name), '')
      or location_url is distinct from nullif(btrim(new.venue_maps_url), '')
      or legacy_coaches is not null
    );

  return new;
end;
$$;

create or replace function public.sync_coach_schedule_events_from_training_location_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.coach_schedule_events
  set
    schedule_date = coalesce(sv.training_date, new.training_date)::date,
    start_time = coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(new.start_time), ''), '09:00'),
    end_time = coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(new.end_time), ''), '12:30'),
    title = coalesce(nullif(btrim(sv.title), ''), nullif(btrim(new.title), ''), '場地訓練'),
    location = nullif(btrim(sv.venue_name), ''),
    location_url = nullif(btrim(sv.venue_maps_url), ''),
    legacy_coaches = null,
    updated_by = coalesce(auth.uid(), public.coach_schedule_events.updated_by),
    updated_at = timezone('utc', now())
  from public.training_location_session_venues sv
  where sv.session_id = new.id
    and public.coach_schedule_events.source_type = 'training_location'
    and public.coach_schedule_events.source_id = new.id
    and public.coach_schedule_events.source_venue_id = sv.id
    and (
      public.coach_schedule_events.schedule_date is distinct from coalesce(sv.training_date, new.training_date)::date
      or public.coach_schedule_events.start_time is distinct from coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(new.start_time), ''), '09:00')
      or public.coach_schedule_events.end_time is distinct from coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(new.end_time), ''), '12:30')
      or public.coach_schedule_events.title is distinct from coalesce(nullif(btrim(sv.title), ''), nullif(btrim(new.title), ''), '場地訓練')
      or public.coach_schedule_events.location is distinct from nullif(btrim(sv.venue_name), '')
      or public.coach_schedule_events.location_url is distinct from nullif(btrim(sv.venue_maps_url), '')
      or public.coach_schedule_events.legacy_coaches is not null
    );

  return new;
end;
$$;

drop trigger if exists coach_schedule_sync_training_location_venue_after_change
  on public.training_location_session_venues;

create trigger coach_schedule_sync_training_location_venue_after_change
after insert or update of
  title,
  training_date,
  start_time,
  end_time,
  venue_name,
  venue_maps_url
on public.training_location_session_venues
for each row
execute function public.sync_coach_schedule_events_from_training_location_venue();

drop trigger if exists coach_schedule_sync_training_location_session_after_change
  on public.training_location_sessions;

create trigger coach_schedule_sync_training_location_session_after_change
after update of
  title,
  training_date,
  start_time,
  end_time
on public.training_location_sessions
for each row
execute function public.sync_coach_schedule_events_from_training_location_session();

update public.coach_schedule_events
set
  schedule_date = coalesce(sv.training_date, s.training_date)::date,
  start_time = coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), ''), '09:00'),
  end_time = coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), ''), '12:30'),
  title = coalesce(nullif(btrim(sv.title), ''), nullif(btrim(s.title), ''), '場地訓練'),
  location = nullif(btrim(sv.venue_name), ''),
  location_url = nullif(btrim(sv.venue_maps_url), ''),
  legacy_coaches = null,
  updated_at = timezone('utc', now())
from public.training_location_sessions s
join public.training_location_session_venues sv on sv.session_id = s.id
where public.coach_schedule_events.source_type = 'training_location'
  and public.coach_schedule_events.source_id = s.id
  and public.coach_schedule_events.source_venue_id = sv.id
  and (
    public.coach_schedule_events.schedule_date is distinct from coalesce(sv.training_date, s.training_date)::date
    or public.coach_schedule_events.start_time is distinct from coalesce(nullif(btrim(sv.start_time), ''), nullif(btrim(s.start_time), ''), '09:00')
    or public.coach_schedule_events.end_time is distinct from coalesce(nullif(btrim(sv.end_time), ''), nullif(btrim(s.end_time), ''), '12:30')
    or public.coach_schedule_events.title is distinct from coalesce(nullif(btrim(sv.title), ''), nullif(btrim(s.title), ''), '場地訓練')
    or public.coach_schedule_events.location is distinct from nullif(btrim(sv.venue_name), '')
    or public.coach_schedule_events.location_url is distinct from nullif(btrim(sv.venue_maps_url), '')
    or public.coach_schedule_events.legacy_coaches is not null
  );

revoke all on function public.sync_coach_schedule_events_from_training_location_venue() from public;
revoke all on function public.sync_coach_schedule_events_from_training_location_venue() from anon;
revoke all on function public.sync_coach_schedule_events_from_training_location_venue() from authenticated;

revoke all on function public.sync_coach_schedule_events_from_training_location_session() from public;
revoke all on function public.sync_coach_schedule_events_from_training_location_session() from anon;
revoke all on function public.sync_coach_schedule_events_from_training_location_session() from authenticated;

notify pgrst, 'reload schema';

commit;
