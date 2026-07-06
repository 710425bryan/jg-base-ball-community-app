begin;

update public.training_program_settings
set
  label = '中港總部',
  updated_at = timezone('utc', now())
where program_key = 'chunggang_school_team';

update public.training_program_settings
set
  label = '新泰總部',
  updated_at = timezone('utc', now())
where program_key = 'junior_high_school_team';

commit;
