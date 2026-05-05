-- Optional verification queries for the training hotfixes.
-- Run these in Supabase SQL Editor after applying the hotfix scripts.

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.attendance_records'::regclass
  and conname = 'attendance_records_status_check';

select
  status,
  count(*) as record_count
from public.attendance_records
group by status
order by status;

select
  pg_get_functiondef('public.publish_training_selection(uuid)'::regprocedure) as function_definition;
