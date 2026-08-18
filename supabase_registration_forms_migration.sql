begin;

create table if not exists public.registration_form_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  original_file_name text not null,
  file_type text not null,
  profile_key text not null,
  profile_version integer not null default 1,
  max_players integer not null,
  has_photo_slots boolean not null default true,
  storage_path text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint registration_form_templates_name_not_blank check (length(btrim(name)) > 0),
  constraint registration_form_templates_file_name_not_blank check (length(btrim(original_file_name)) > 0),
  constraint registration_form_templates_file_type_supported check (file_type in ('xlsx', 'docx')),
  constraint registration_form_templates_profile_supported check (
    (profile_key = 'just_baseball_taipei' and profile_version = 1 and file_type = 'xlsx' and max_players = 30)
    or
    (profile_key = 'chairperson_cup_u9' and profile_version = 1 and file_type = 'docx' and max_players = 20)
  ),
  constraint registration_form_templates_capacity_valid check (max_players between 1 and 100)
);

create table if not exists public.registration_form_generation_logs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.registration_form_templates(id) on delete set null,
  template_name_snapshot text not null,
  output_file_name text not null,
  player_count integer not null,
  generated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint registration_form_generation_logs_template_name_not_blank check (length(btrim(template_name_snapshot)) > 0),
  constraint registration_form_generation_logs_output_name_not_blank check (length(btrim(output_file_name)) > 0),
  constraint registration_form_generation_logs_player_count_valid check (player_count between 1 and 100)
);

comment on table public.registration_form_templates
is 'Private original OOXML registration form templates. Generated documents are never retained.';

comment on table public.registration_form_generation_logs
is 'Minimal audit log for document generation. It intentionally excludes member ids, personal data and generated files.';

create index if not exists registration_form_templates_created_at_idx
  on public.registration_form_templates (created_at desc);

create index if not exists registration_form_generation_logs_created_at_idx
  on public.registration_form_generation_logs (created_at desc);

create or replace function public.set_registration_form_template_audit_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name = nullif(btrim(coalesce(new.name, '')), '');
  new.original_file_name = nullif(btrim(coalesce(new.original_file_name, '')), '');
  new.storage_path = nullif(btrim(coalesce(new.storage_path, '')), '');

  if new.name is null or new.original_file_name is null or new.storage_path is null then
    raise exception 'registration form template metadata is incomplete';
  end if;

  if TG_OP = 'INSERT' then
    new.created_by = coalesce(new.created_by, auth.uid());
  end if;

  new.updated_by = coalesce(auth.uid(), new.updated_by);
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_registration_form_template_audit_fields on public.registration_form_templates;
create trigger set_registration_form_template_audit_fields
before insert or update on public.registration_form_templates
for each row execute function public.set_registration_form_template_audit_fields();

alter table public.registration_form_templates enable row level security;
alter table public.registration_form_generation_logs enable row level security;

drop policy if exists "registration_form_templates_select" on public.registration_form_templates;
create policy "registration_form_templates_select"
  on public.registration_form_templates for select to authenticated
  using (public.has_app_permission('registration_forms', 'VIEW'));

drop policy if exists "registration_form_templates_insert" on public.registration_form_templates;
create policy "registration_form_templates_insert"
  on public.registration_form_templates for insert to authenticated
  with check (public.has_app_permission('registration_forms', 'CREATE'));

drop policy if exists "registration_form_templates_update" on public.registration_form_templates;
create policy "registration_form_templates_update"
  on public.registration_form_templates for update to authenticated
  using (public.has_app_permission('registration_forms', 'EDIT'))
  with check (public.has_app_permission('registration_forms', 'EDIT'));

drop policy if exists "registration_form_templates_delete" on public.registration_form_templates;
create policy "registration_form_templates_delete"
  on public.registration_form_templates for delete to authenticated
  using (public.has_app_permission('registration_forms', 'DELETE'));

drop policy if exists "registration_form_generation_logs_select" on public.registration_form_generation_logs;
create policy "registration_form_generation_logs_select"
  on public.registration_form_generation_logs for select to authenticated
  using (public.has_app_permission('registration_forms', 'VIEW'));

drop policy if exists "registration_form_generation_logs_insert" on public.registration_form_generation_logs;
create policy "registration_form_generation_logs_insert"
  on public.registration_form_generation_logs for insert to authenticated
  with check (
    generated_by = auth.uid()
    and public.has_app_permission('registration_forms', 'CREATE')
    and public.has_app_permission('players', 'EDIT')
  );

insert into public.app_role_permissions (role_key, feature, action)
values
  ('ADMIN', 'registration_forms', 'VIEW'),
  ('ADMIN', 'registration_forms', 'CREATE'),
  ('ADMIN', 'registration_forms', 'EDIT'),
  ('ADMIN', 'registration_forms', 'DELETE')
on conflict (role_key, feature, action) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registration-forms',
  'registration-forms',
  false,
  10485760,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "registration_forms_storage_select" on storage.objects;
create policy "registration_forms_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'registration-forms'
    and public.has_app_permission('registration_forms', 'VIEW')
  );

drop policy if exists "registration_forms_storage_insert" on storage.objects;
create policy "registration_forms_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'registration-forms'
    and public.has_app_permission('registration_forms', 'CREATE')
  );

drop policy if exists "registration_forms_storage_update" on storage.objects;
create policy "registration_forms_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'registration-forms'
    and public.has_app_permission('registration_forms', 'EDIT')
  )
  with check (
    bucket_id = 'registration-forms'
    and public.has_app_permission('registration_forms', 'EDIT')
  );

drop policy if exists "registration_forms_storage_delete" on storage.objects;
create policy "registration_forms_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'registration-forms'
    and public.has_app_permission('registration_forms', 'DELETE')
  );

grant select, insert, update, delete on public.registration_form_templates to authenticated, service_role;
grant select, insert on public.registration_form_generation_logs to authenticated, service_role;

commit;
