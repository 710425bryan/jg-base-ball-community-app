begin;

create index if not exists quarterly_fees_member_id_idx
  on public.quarterly_fees (member_id);

create index if not exists team_members_sibling_id_idx
  on public.team_members (sibling_id);

create index if not exists leave_requests_user_id_idx
  on public.leave_requests (user_id);

create index if not exists attendance_records_member_id_idx
  on public.attendance_records (member_id);

create index if not exists equipment_purchase_request_items_equipment_id_idx
  on public.equipment_purchase_request_items (equipment_id);

create index if not exists equipment_purchase_request_items_equipment_transaction_id_idx
  on public.equipment_purchase_request_items (equipment_transaction_id);

create index if not exists equipment_purchase_requests_requested_by_idx
  on public.equipment_purchase_requests (requested_by);

create index if not exists equipment_purchase_requests_approved_by_idx
  on public.equipment_purchase_requests (approved_by);

create index if not exists equipment_purchase_requests_ready_by_idx
  on public.equipment_purchase_requests (ready_by);

create index if not exists equipment_purchase_requests_picked_up_by_idx
  on public.equipment_purchase_requests (picked_up_by);

create index if not exists equipment_purchase_requests_rejected_by_idx
  on public.equipment_purchase_requests (rejected_by);

create index if not exists equipment_purchase_requests_cancelled_by_idx
  on public.equipment_purchase_requests (cancelled_by);

create index if not exists equipment_transactions_payment_submission_id_idx
  on public.equipment_transactions (payment_submission_id);

create index if not exists equipment_transactions_paid_by_idx
  on public.equipment_transactions (paid_by);

create index if not exists equipment_payment_submissions_profile_id_idx
  on public.equipment_payment_submissions (profile_id);

create index if not exists equipment_payment_submissions_reviewed_by_idx
  on public.equipment_payment_submissions (reviewed_by);

create index if not exists equipment_payment_submission_items_transaction_id_idx
  on public.equipment_payment_submission_items (transaction_id);

create index if not exists attendance_events_created_by_idx
  on public.attendance_events (created_by);

create index if not exists player_balance_transactions_created_by_idx
  on public.player_balance_transactions (created_by);

create index if not exists player_point_transactions_created_by_idx
  on public.player_point_transactions (created_by);

create index if not exists player_point_transactions_related_registration_id_idx
  on public.player_point_transactions (related_registration_id);

create index if not exists player_point_transactions_related_session_id_idx
  on public.player_point_transactions (related_session_id);

create index if not exists training_location_assignments_assigned_by_idx
  on public.training_location_assignments (assigned_by);

create index if not exists idx_push_dispatch_events_target_user_created
  on public.push_dispatch_events (target_user_id, created_at desc)
  where target_user_id is not null;

drop index if exists public.idx_push_dispatch_events_target_user;

commit;
