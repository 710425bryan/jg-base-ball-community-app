begin;

update public.team_members
set team_group = null
where coalesce(role, '') not in ('球員', '校隊')
  and team_group is not null;

notify pgrst, 'reload schema';

commit;
