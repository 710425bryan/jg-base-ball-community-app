begin;

do $$
declare
  v_has_location_id boolean;
  v_has_session_venue_id boolean;
  v_session_attnum smallint;
  v_session_venue_attnum smallint;
  v_constraint_name text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_location_assignments'
      and column_name = 'location_id'
  )
  into v_has_location_id;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_location_assignments'
      and column_name = 'session_venue_id'
  )
  into v_has_session_venue_id;

  if v_has_location_id and not v_has_session_venue_id then
    alter table public.training_location_assignments
      rename column location_id to session_venue_id;
    v_has_location_id := false;
    v_has_session_venue_id := true;
  end if;

  alter table public.training_location_assignments
    alter column id set default gen_random_uuid(),
    add column if not exists session_venue_id uuid,
    add column if not exists assigned_by uuid references public.profiles(id) on delete set null,
    add column if not exists created_at timestamptz not null default timezone('utc', now()),
    add column if not exists updated_at timestamptz not null default timezone('utc', now());

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_location_assignments'
      and column_name = 'registration_id'
  ) then
    alter table public.training_location_assignments
      alter column registration_id drop not null;
  end if;

  if v_has_location_id and v_has_session_venue_id then
    execute 'update public.training_location_assignments set session_venue_id = coalesce(session_venue_id, location_id) where session_venue_id is null';
  end if;

  select attnum::smallint
  into v_session_attnum
  from pg_attribute
  where attrelid = 'public.training_location_assignments'::regclass
    and attname = 'session_id'
    and not attisdropped;

  select attnum::smallint
  into v_session_venue_attnum
  from pg_attribute
  where attrelid = 'public.training_location_assignments'::regclass
    and attname = 'session_venue_id'
    and not attisdropped;

  for v_constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and contype = 'f'
      and conkey = array[v_session_attnum]::smallint[]
      and confrelid <> 'public.training_location_sessions'::regclass
  loop
    execute format('alter table public.training_location_assignments drop constraint %I', v_constraint_name);
  end loop;

  for v_constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and contype = 'f'
      and conkey = array[v_session_venue_attnum]::smallint[]
      and confrelid <> 'public.training_location_session_venues'::regclass
  loop
    execute format('alter table public.training_location_assignments drop constraint %I', v_constraint_name);
  end loop;

  if not exists (
    select 1
    from public.training_location_assignments
    where session_venue_id is null
  ) then
    alter table public.training_location_assignments
      alter column session_venue_id set not null;
  end if;

  if v_session_venue_attnum is not null and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and contype = 'f'
      and conkey = array[v_session_venue_attnum]::smallint[]
      and confrelid = 'public.training_location_session_venues'::regclass
  ) then
    alter table public.training_location_assignments
      add constraint training_location_assignments_session_venue_id_fkey
      foreign key (session_venue_id)
      references public.training_location_session_venues(id)
      on delete cascade
      not valid;
  end if;

  if v_session_attnum is not null and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and contype = 'f'
      and conkey = array[v_session_attnum]::smallint[]
      and confrelid = 'public.training_location_sessions'::regclass
  ) then
    alter table public.training_location_assignments
      add constraint training_location_assignments_session_id_fkey
      foreign key (session_id)
      references public.training_location_sessions(id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_location_assignments'::regclass
      and conname = 'training_location_assignments_session_member_key'
  ) then
    alter table public.training_location_assignments
      add constraint training_location_assignments_session_member_key
      unique (session_id, member_id);
  end if;
end;
$$;

create index if not exists training_location_assignments_session_venue_idx
  on public.training_location_assignments (session_venue_id);

notify pgrst, 'reload schema';

commit;
