alter table public.matches
add column if not exists tournament_name text;

notify pgrst, 'reload schema';
