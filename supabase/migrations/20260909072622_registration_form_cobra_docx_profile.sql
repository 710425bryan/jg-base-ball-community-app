begin;

alter table public.registration_form_templates
  drop constraint if exists registration_form_templates_profile_supported;

alter table public.registration_form_templates
  add constraint registration_form_templates_profile_supported check (
    (profile_key = 'just_baseball_taipei' and profile_version = 1 and file_type = 'xlsx' and max_players = 30)
    or
    (profile_key = 'chairperson_cup_u9' and profile_version = 1 and file_type = 'docx' and max_players = 20)
    or
    (profile_key = 'cobra_cup_u9_pdf' and profile_version = 1 and file_type = 'pdf' and max_players = 14)
    or
    (profile_key = 'cobra_cup_docx' and profile_version = 1 and file_type = 'docx' and max_players = 14 and has_photo_slots = false)
  );

commit;
