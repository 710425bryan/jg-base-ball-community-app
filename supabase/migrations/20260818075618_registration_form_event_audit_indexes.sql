begin;

create index if not exists registration_form_events_created_by_idx
  on public.registration_form_events (created_by);

create index if not exists registration_form_events_updated_by_idx
  on public.registration_form_events (updated_by);

create index if not exists registration_form_event_templates_created_by_idx
  on public.registration_form_event_templates (created_by);

commit;
