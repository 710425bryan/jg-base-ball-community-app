begin;

create table public.registration_form_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season_year integer not null default extract(year from timezone('Asia/Taipei', now()))::integer,
  category text not null default '',
  organizer text not null default '',
  registration_deadline date,
  status text not null default 'draft',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint registration_form_events_name_not_blank check (length(btrim(name)) > 0),
  constraint registration_form_events_season_year_valid check (season_year between 2000 and 2200),
  constraint registration_form_events_status_valid check (
    status in ('draft', 'in_progress', 'submitted', 'closed')
  ),
  constraint registration_form_events_category_length check (length(category) <= 80),
  constraint registration_form_events_organizer_length check (length(organizer) <= 120),
  constraint registration_form_events_notes_length check (length(notes) <= 1000)
);

create table public.registration_form_event_templates (
  event_id uuid not null references public.registration_form_events(id) on delete cascade,
  template_id uuid not null references public.registration_form_templates(id) on delete cascade,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (event_id, template_id),
  constraint registration_form_event_templates_sort_order_valid check (sort_order between 0 and 100)
);

alter table public.registration_form_generation_logs
  add column if not exists event_id uuid references public.registration_form_events(id) on delete set null,
  add column if not exists event_name_snapshot text;

alter table public.registration_form_generation_logs
  drop constraint if exists registration_form_generation_logs_event_snapshot_valid;

alter table public.registration_form_generation_logs
  add constraint registration_form_generation_logs_event_snapshot_valid check (
    event_id is null
    or length(btrim(coalesce(event_name_snapshot, ''))) > 0
  );

comment on table public.registration_form_events
is 'Competition registration work items. Contains event metadata only and no player personal data.';

comment on table public.registration_form_event_templates
is 'Reusable registration form templates attached to a competition registration work item.';

comment on column public.registration_form_generation_logs.event_name_snapshot
is 'Non-personal event name snapshot retained when the event is later deleted.';

create index registration_form_events_status_deadline_idx
  on public.registration_form_events (status, registration_deadline, created_at desc);

create index registration_form_events_created_by_idx
  on public.registration_form_events (created_by);

create index registration_form_events_updated_by_idx
  on public.registration_form_events (updated_by);

create index registration_form_event_templates_template_idx
  on public.registration_form_event_templates (template_id, event_id);

create index registration_form_event_templates_created_by_idx
  on public.registration_form_event_templates (created_by);

create index registration_form_generation_logs_event_idx
  on public.registration_form_generation_logs (event_id, created_at desc);

create or replace function public.set_registration_form_event_audit_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name = nullif(btrim(coalesce(new.name, '')), '');
  new.category = btrim(coalesce(new.category, ''));
  new.organizer = btrim(coalesce(new.organizer, ''));
  new.notes = btrim(coalesce(new.notes, ''));

  if new.name is null then
    raise exception 'registration form event name is required';
  end if;

  if TG_OP = 'INSERT' then
    new.created_by = coalesce(new.created_by, (select auth.uid()));
  end if;

  new.updated_by = coalesce((select auth.uid()), new.updated_by);
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger set_registration_form_event_audit_fields
before insert or update on public.registration_form_events
for each row execute function public.set_registration_form_event_audit_fields();

alter table public.registration_form_events enable row level security;
alter table public.registration_form_event_templates enable row level security;

create policy "registration_form_events_select"
  on public.registration_form_events for select to authenticated
  using (public.has_app_permission('registration_forms', 'VIEW'));

create policy "registration_form_events_insert"
  on public.registration_form_events for insert to authenticated
  with check (public.has_app_permission('registration_forms', 'CREATE'));

create policy "registration_form_events_update"
  on public.registration_form_events for update to authenticated
  using (public.has_app_permission('registration_forms', 'EDIT'))
  with check (public.has_app_permission('registration_forms', 'EDIT'));

create policy "registration_form_events_delete"
  on public.registration_form_events for delete to authenticated
  using (public.has_app_permission('registration_forms', 'DELETE'));

create policy "registration_form_event_templates_select"
  on public.registration_form_event_templates for select to authenticated
  using (public.has_app_permission('registration_forms', 'VIEW'));

create policy "registration_form_event_templates_insert"
  on public.registration_form_event_templates for insert to authenticated
  with check (
    public.has_app_permission('registration_forms', 'CREATE')
    or public.has_app_permission('registration_forms', 'EDIT')
  );

create policy "registration_form_event_templates_update"
  on public.registration_form_event_templates for update to authenticated
  using (public.has_app_permission('registration_forms', 'EDIT'))
  with check (public.has_app_permission('registration_forms', 'EDIT'));

create policy "registration_form_event_templates_delete"
  on public.registration_form_event_templates for delete to authenticated
  using (
    public.has_app_permission('registration_forms', 'CREATE')
    or public.has_app_permission('registration_forms', 'EDIT')
    or public.has_app_permission('registration_forms', 'DELETE')
  );

create or replace function public.save_registration_form_event(
  p_event_id uuid,
  p_name text,
  p_season_year integer,
  p_category text,
  p_organizer text,
  p_registration_deadline date,
  p_status text,
  p_notes text,
  p_template_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event_id uuid;
  v_template_ids uuid[] := coalesce(p_template_ids, array[]::uuid[]);
begin
  if p_event_id is null then
    if not public.has_app_permission('registration_forms', 'CREATE') then
      raise exception 'registration_forms:CREATE permission required';
    end if;

    insert into public.registration_form_events (
      name,
      season_year,
      category,
      organizer,
      registration_deadline,
      status,
      notes
    ) values (
      p_name,
      p_season_year,
      coalesce(p_category, ''),
      coalesce(p_organizer, ''),
      p_registration_deadline,
      p_status,
      coalesce(p_notes, '')
    )
    returning id into v_event_id;
  else
    if not public.has_app_permission('registration_forms', 'EDIT') then
      raise exception 'registration_forms:EDIT permission required';
    end if;

    update public.registration_form_events
    set
      name = p_name,
      season_year = p_season_year,
      category = coalesce(p_category, ''),
      organizer = coalesce(p_organizer, ''),
      registration_deadline = p_registration_deadline,
      status = p_status,
      notes = coalesce(p_notes, '')
    where id = p_event_id
    returning id into v_event_id;

    if v_event_id is null then
      raise exception 'registration form event not found';
    end if;
  end if;

  delete from public.registration_form_event_templates
  where event_id = v_event_id
    and not (template_id = any(v_template_ids));

  insert into public.registration_form_event_templates (
    event_id,
    template_id,
    sort_order,
    created_by
  )
  select distinct on (selected.template_id)
    v_event_id,
    selected.template_id,
    (selected.ordinality - 1)::integer,
    (select auth.uid())
  from unnest(v_template_ids) with ordinality as selected(template_id, ordinality)
  order by selected.template_id, selected.ordinality
  on conflict (event_id, template_id) do update
  set sort_order = excluded.sort_order;

  return v_event_id;
end;
$$;

revoke all on function public.save_registration_form_event(
  uuid, text, integer, text, text, date, text, text, uuid[]
) from public, anon;

grant execute on function public.save_registration_form_event(
  uuid, text, integer, text, text, date, text, text, uuid[]
) to authenticated, service_role;

grant select, insert, update, delete on public.registration_form_events to authenticated, service_role;
grant select, insert, update, delete on public.registration_form_event_templates to authenticated, service_role;

commit;
