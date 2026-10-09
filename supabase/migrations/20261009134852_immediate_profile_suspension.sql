begin;

-- No RLS/grant changes: each signed-in client filters to its own profiles.id.
-- Existing profiles_select_self_or_users_view permits the self row after
-- suspension, which is necessary for delivering the revocation UPDATE.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

commit;
