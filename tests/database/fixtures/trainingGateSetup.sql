create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema private;
grant usage on schema public, auth to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table public.profiles (
  id uuid primary key, role text, is_active boolean not null default true,
  access_start timestamptz, access_end timestamptz,
  linked_team_member_ids uuid[] default '{}', name text, nickname text
);
create table public.app_role_permissions (
  role_key text, feature text, action text, primary key(role_key,feature,action)
);
create table public.team_members (
  id uuid primary key, name text, role text, team_group text,
  jersey_number text, created_at timestamptz default now()
);
create table public.matches (
  id uuid primary key default gen_random_uuid(), match_name text, opponent text,
  match_date date, match_time text, location text, category_group text, match_level text,
  home_score integer, opponent_score integer, coaches text, players text,
  note text, photo_url text, absent_players jsonb, lineup jsonb, current_lineup jsonb,
  inning_logs jsonb, batting_stats jsonb, pitching_stats jsonb,
  current_batter_name text, current_inning text, current_b integer, current_s integer, current_o integer,
  base_1 boolean, base_2 boolean, base_3 boolean, bat_first boolean,
  show_lineup_intro boolean, show_line_score boolean, show_3d_field boolean, line_score_data jsonb
);
create table public.attendance_events (
  id uuid primary key default gen_random_uuid(), title text, date date, event_type text, created_by uuid
);
create table public.attendance_records (
  id uuid primary key default gen_random_uuid(), event_id uuid references public.attendance_events,
  member_id uuid references public.team_members, status text, unique(event_id,member_id)
);
alter table public.attendance_events enable row level security;
alter table public.attendance_records enable row level security;
create table public.training_location_assignments (registration_id uuid, session_venue_id uuid);
create table public.training_locations (id uuid, location_name text, training_time text, coach_names text);
create table public.push_dispatch_events (
  id uuid primary key default gen_random_uuid(), event_key text, feature text, action text,
  title text, body text, created_at timestamptz default now(), url text,
  target_user_id uuid, target_member_ids uuid[], match_id uuid
);
create table public.leave_requests (
  id uuid, user_id uuid, leave_type text, start_date date, end_date date, reason text, created_at timestamptz
);
create table public.join_inquiries (id uuid,parent_name text,phone text,created_at timestamptz);
create table public.system_settings (key text primary key,value jsonb);
create function public.get_fee_management_reminders() returns jsonb language sql as $$ select '{"items":[]}'::jsonb $$;
create function public.has_any_app_permission(text[],text) returns boolean language sql as $$ select false $$;
