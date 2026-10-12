import { read, id, extractFunction } from './quarterlyPaymentOwnership.fixture.mjs'
import { setupMatchFees } from './matchFeeBilling.fixture.mjs'

export async function setupMatchCancellation(db) {
  await setupMatchFees(db)
  await db.exec(read('supabase/migrations/20260927040433_match_fee_single_match_exemptions.sql'))
  await db.exec(read('supabase/migrations/20260927051302_independent_player_match_billing.sql'))
  // Use the real record RPC's column types so the fixture cannot silently use
  // client aliases or a made-up financial schema.
  const recordSql = extractFunction('supabase_my_player_records_migration.sql', 'get_my_player_match_records')
  for (const column of recordSql.match(/returns table \(([\s\S]*?)\)\s*language/)[1].split(',')) {
    await db.exec(`alter table matches add column if not exists ${column.trim()}`)
  }
  await db.exec(`
    alter table matches alter column updated_at set default now();
    alter table matches alter column created_at set default now();
    update matches set updated_at=now(),created_at=now(),match_level='友誼賽',
      photo_url='https://example.test/photo.jpg',batting_stats='[{"name":"兄","H":2}]';
    alter table team_members add column jersey_number text;
    create table attendance_events(id uuid,title text,date date,event_type text,created_at timestamptz);
    create table attendance_records(event_id uuid,member_id uuid,status text);
    create table announcements(id uuid,title text,content text,created_at timestamptz,is_pinned boolean,image_url text);
    create function mask_display_name(text) returns text language sql as $$ select 'masked'::text $$;
    create table coach_schedule_events(id uuid primary key,source_type text,source_id uuid,status text,updated_at timestamptz default now());
    create table coach_schedule_assignments(id uuid,event_id uuid,coach_profile_id uuid);
    insert into coach_schedule_events values ('${id(61)}','match','${id(41)}','scheduled',now());
    insert into coach_schedule_assignments values ('${id(62)}','${id(61)}','${id(5)}');
    create table push_dispatch_events(id uuid,feature text,action text,match_id uuid,title text,body text,url text,created_at timestamptz);
    insert into push_dispatch_events values ('${id(71)}','matches','REMINDER','${id(41)}','集合','明日集合',null,now()),
      ('${id(72)}','matches','REMINDER','${id(42)}','集合','明日集合',null,now());
    alter table matches enable row level security;
    grant select,insert,update on matches to authenticated;
    create policy matches_read on matches for select to authenticated using (public.current_profile_role() is not null);
    create policy matches_edit on matches for update to authenticated using (public.has_app_permission('matches','EDIT')) with check (public.has_app_permission('matches','EDIT'));
    create policy matches_insert on matches for insert to authenticated with check (public.has_app_permission('matches','CREATE'));
    grant usage on schema private to authenticated;
  `)
  await db.exec(recordSql)
  await db.exec(extractFunction('supabase_my_home_next_match_week_window_migration.sql', 'get_my_home_next_event'))
  await db.exec(extractFunction('supabase_access_control_rls_migration.sql', 'get_public_landing_snapshot'))
  // Execute the real match-reminder CTE, with unrelated feed branches omitted.
  const feed = read('supabase_zzzzzzzz_training_auto_select_notifications_migration.sql')
  const matchCte = feed.slice(feed.indexOf('  match_items as ('), feed.indexOf('  announcement_items as (')).trim().replace(/,$/, '')
  await db.exec(`create function private.notification_feed_before_coach_leave(integer,boolean)
    returns table(id text,source text,title text,body text,created_at timestamptz,link text,highlight_member_id uuid)
    language sql security definer as $$
      with limit_settings as (select $1 as feed_limit), ${matchCte} select * from match_items
    $$;`)
  // Actual candidate query; training branches and payload enrichment are
  // covered by the separate full coach schedule SQL suite.
  const coachSql = read('supabase/migrations/20260924054852_coach_schedule_shared_training_slots.sql')
  const candidateCte = coachSql.slice(coachSql.indexOf('  match_candidates as ('), coachSql.indexOf('  candidates as (')).trim().replace(/,$/, '')
  await db.exec(`create function private.list_coach_schedule_admin_month_base(p_month date)
    returns jsonb language plpgsql security definer as $$
    declare v_month_start date:=p_month; v_month_end date:=p_month+interval '1 month';
    begin return (with ${candidateCte} select coalesce(jsonb_agg(m),'[]') from match_candidates m); end;
    $$;`)
}
