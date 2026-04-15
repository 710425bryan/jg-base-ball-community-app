alter table public.matches
add column if not exists google_calendar_event_id text;

create unique index if not exists matches_google_calendar_event_id_uidx
on public.matches (google_calendar_event_id)
where google_calendar_event_id is not null;
