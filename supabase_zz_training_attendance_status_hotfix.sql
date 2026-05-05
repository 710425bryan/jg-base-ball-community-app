begin;

-- Hotfix: training attendance events initialize selected players as "待點名".
-- The existing attendance_records_status_check constraint predates that state,
-- causing create_training_attendance_event() to fail when inserting records.

alter table public.attendance_records
  drop constraint if exists attendance_records_status_check;

alter table public.attendance_records
  add constraint attendance_records_status_check
  check (status in ('待點名', '出席', '請假', '缺席', '遲到', '早退'));

notify pgrst, 'reload schema';

commit;
