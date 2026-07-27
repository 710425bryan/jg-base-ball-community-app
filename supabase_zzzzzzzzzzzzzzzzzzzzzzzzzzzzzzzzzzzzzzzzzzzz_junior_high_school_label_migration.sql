begin;

update public.training_program_settings
set
  label = '國中部',
  updated_at = timezone('utc', now())
where program_key = 'junior_high_school_team'
  and label is distinct from '國中部';

update public.system_settings
set
  description = '國中部單次月費與訓練日期計費設定',
  updated_at = timezone('utc', now())
where key = 'xintai_monthly_per_session_defaults'
  and description is distinct from '國中部單次月費與訓練日期計費設定';

commit;
