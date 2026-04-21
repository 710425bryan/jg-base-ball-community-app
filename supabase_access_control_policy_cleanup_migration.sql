begin;

do $$
declare
  target_table text;
  target_tables constant text[] := array[
    'profiles',
    'team_members',
    'leave_requests',
    'join_inquiries',
    'announcements',
    'attendance_events',
    'attendance_records',
    'matches',
    'fee_settings',
    'monthly_fees',
    'quarterly_fees',
    'profile_payment_submissions'
  ];
  policy_record record;
begin
  foreach target_table in array target_tables
  loop
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_record.policyname,
        target_table
      );
    end loop;
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.leave_requests enable row level security;
alter table public.join_inquiries enable row level security;
alter table public.announcements enable row level security;
alter table public.attendance_events enable row level security;
alter table public.attendance_records enable row level security;
alter table public.matches enable row level security;
alter table public.fee_settings enable row level security;
alter table public.monthly_fees enable row level security;
alter table public.quarterly_fees enable row level security;
alter table public.profile_payment_submissions enable row level security;

create policy "profiles_select_self_or_users_view"
  on public.profiles
  for select
  using (
    auth.uid() = id
    or public.has_app_permission('users', 'VIEW')
  );

create policy "profiles_update_self_or_users_edit"
  on public.profiles
  for update
  using (
    auth.uid() = id
    or public.has_app_permission('users', 'EDIT')
  )
  with check (
    auth.uid() = id
    or public.has_app_permission('users', 'EDIT')
  );

create policy "team_members_select_permitted_features"
  on public.team_members
  for select
  using (
    public.has_any_app_permission(
      array['players', 'leave_requests', 'attendance', 'fees', 'users', 'matches'],
      'VIEW'
    )
  );

create policy "team_members_insert_players_create"
  on public.team_members
  for insert
  with check (public.has_app_permission('players', 'CREATE'));

create policy "team_members_update_players_edit"
  on public.team_members
  for update
  using (public.has_app_permission('players', 'EDIT'))
  with check (public.has_app_permission('players', 'EDIT'));

create policy "team_members_delete_players_delete"
  on public.team_members
  for delete
  using (public.has_app_permission('players', 'DELETE'));

create policy "leave_requests_select_leave_or_attendance_view"
  on public.leave_requests
  for select
  using (
    public.has_app_permission('leave_requests', 'VIEW')
    or public.has_app_permission('attendance', 'VIEW')
  );

create policy "leave_requests_insert_leave_create"
  on public.leave_requests
  for insert
  with check (public.has_app_permission('leave_requests', 'CREATE'));

create policy "leave_requests_update_leave_edit"
  on public.leave_requests
  for update
  using (public.has_app_permission('leave_requests', 'EDIT'))
  with check (public.has_app_permission('leave_requests', 'EDIT'));

create policy "leave_requests_delete_leave_delete"
  on public.leave_requests
  for delete
  using (public.has_app_permission('leave_requests', 'DELETE'));

create policy "join_inquiries_insert_public"
  on public.join_inquiries
  for insert
  with check (true);

create policy "join_inquiries_select_view"
  on public.join_inquiries
  for select
  using (public.has_app_permission('join_inquiries', 'VIEW'));

create policy "join_inquiries_update_edit"
  on public.join_inquiries
  for update
  using (public.has_app_permission('join_inquiries', 'EDIT'))
  with check (public.has_app_permission('join_inquiries', 'EDIT'));

create policy "join_inquiries_delete_delete"
  on public.join_inquiries
  for delete
  using (public.has_app_permission('join_inquiries', 'DELETE'));

create policy "announcements_select_view"
  on public.announcements
  for select
  using (public.has_app_permission('announcements', 'VIEW'));

create policy "announcements_insert_create"
  on public.announcements
  for insert
  with check (public.has_app_permission('announcements', 'CREATE'));

create policy "announcements_update_edit"
  on public.announcements
  for update
  using (public.has_app_permission('announcements', 'EDIT'))
  with check (public.has_app_permission('announcements', 'EDIT'));

create policy "announcements_delete_delete"
  on public.announcements
  for delete
  using (public.has_app_permission('announcements', 'DELETE'));

create policy "attendance_events_select_view"
  on public.attendance_events
  for select
  using (public.has_app_permission('attendance', 'VIEW'));

create policy "attendance_events_insert_create"
  on public.attendance_events
  for insert
  with check (public.has_app_permission('attendance', 'CREATE'));

create policy "attendance_events_update_edit"
  on public.attendance_events
  for update
  using (public.has_app_permission('attendance', 'EDIT'))
  with check (public.has_app_permission('attendance', 'EDIT'));

create policy "attendance_events_delete_delete"
  on public.attendance_events
  for delete
  using (public.has_app_permission('attendance', 'DELETE'));

create policy "attendance_records_select_view"
  on public.attendance_records
  for select
  using (public.has_app_permission('attendance', 'VIEW'));

create policy "attendance_records_insert_create"
  on public.attendance_records
  for insert
  with check (public.has_app_permission('attendance', 'CREATE'));

create policy "attendance_records_update_edit"
  on public.attendance_records
  for update
  using (public.has_app_permission('attendance', 'EDIT'))
  with check (public.has_app_permission('attendance', 'EDIT'));

create policy "attendance_records_delete_delete"
  on public.attendance_records
  for delete
  using (public.has_app_permission('attendance', 'DELETE'));

create policy "matches_select_view"
  on public.matches
  for select
  using (public.has_app_permission('matches', 'VIEW'));

create policy "matches_insert_create"
  on public.matches
  for insert
  with check (public.has_app_permission('matches', 'CREATE'));

create policy "matches_update_edit"
  on public.matches
  for update
  using (public.has_app_permission('matches', 'EDIT'))
  with check (public.has_app_permission('matches', 'EDIT'));

create policy "matches_delete_delete"
  on public.matches
  for delete
  using (public.has_app_permission('matches', 'DELETE'));

create policy "fee_settings_select_view"
  on public.fee_settings
  for select
  using (public.has_app_permission('fees', 'VIEW'));

create policy "fee_settings_insert_create"
  on public.fee_settings
  for insert
  with check (public.has_app_permission('fees', 'CREATE'));

create policy "fee_settings_update_edit"
  on public.fee_settings
  for update
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

create policy "fee_settings_delete_delete"
  on public.fee_settings
  for delete
  using (public.has_app_permission('fees', 'DELETE'));

create policy "monthly_fees_select_view"
  on public.monthly_fees
  for select
  using (public.has_app_permission('fees', 'VIEW'));

create policy "monthly_fees_insert_create"
  on public.monthly_fees
  for insert
  with check (public.has_app_permission('fees', 'CREATE'));

create policy "monthly_fees_update_edit"
  on public.monthly_fees
  for update
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

create policy "monthly_fees_delete_delete"
  on public.monthly_fees
  for delete
  using (public.has_app_permission('fees', 'DELETE'));

create policy "quarterly_fees_select_view"
  on public.quarterly_fees
  for select
  using (public.has_app_permission('fees', 'VIEW'));

create policy "quarterly_fees_insert_create"
  on public.quarterly_fees
  for insert
  with check (public.has_app_permission('fees', 'CREATE'));

create policy "quarterly_fees_update_edit"
  on public.quarterly_fees
  for update
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

create policy "quarterly_fees_delete_delete"
  on public.quarterly_fees
  for delete
  using (public.has_app_permission('fees', 'DELETE'));

create policy "profile_payment_submissions_select_own_profile"
  on public.profile_payment_submissions
  for select
  using (profile_id = auth.uid());

create policy "profile_payment_submissions_select_fees_view"
  on public.profile_payment_submissions
  for select
  using (public.has_app_permission('fees', 'VIEW'));

create policy "profile_payment_submissions_insert_own_profile"
  on public.profile_payment_submissions
  for insert
  with check (profile_id = auth.uid());

create policy "profile_payment_submissions_insert_fees_create"
  on public.profile_payment_submissions
  for insert
  with check (public.has_app_permission('fees', 'CREATE'));

create policy "profile_payment_submissions_update_fees_edit"
  on public.profile_payment_submissions
  for update
  using (public.has_app_permission('fees', 'EDIT'))
  with check (public.has_app_permission('fees', 'EDIT'));

create policy "profile_payment_submissions_delete_fees_delete"
  on public.profile_payment_submissions
  for delete
  using (public.has_app_permission('fees', 'DELETE'));

commit;
