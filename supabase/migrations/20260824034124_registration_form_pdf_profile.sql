begin;

alter table public.registration_form_templates
  drop constraint if exists registration_form_templates_file_type_supported;

alter table public.registration_form_templates
  add constraint registration_form_templates_file_type_supported
  check (file_type in ('xlsx', 'docx', 'pdf'));

alter table public.registration_form_templates
  drop constraint if exists registration_form_templates_profile_supported;

alter table public.registration_form_templates
  add constraint registration_form_templates_profile_supported check (
    (profile_key = 'just_baseball_taipei' and profile_version = 1 and file_type = 'xlsx' and max_players = 30)
    or
    (profile_key = 'chairperson_cup_u9' and profile_version = 1 and file_type = 'docx' and max_players = 20)
    or
    (profile_key = 'cobra_cup_u9_pdf' and profile_version = 1 and file_type = 'pdf' and max_players = 14)
  );

update storage.buckets
set allowed_mime_types = array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf'
]
where id = 'registration-forms';

comment on table public.registration_form_templates
is 'Private original XLSX, DOCX or approved PDF registration form templates. Generated documents are never retained.';

commit;
