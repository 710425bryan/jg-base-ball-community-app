begin;

comment on column public.team_members.team_group
is '所屬群組 (熊隊)';

update public.team_members
set team_group = case team_group
  when '灰熊(大組)' then '暴力熊(大組)'
  when '成灰熊(中組)' then '黑熊(中組)'
  else team_group
end
where team_group in (
  '灰熊(大組)',
  '成灰熊(中組)'
);

update public.team_members
set team_group = null
where coalesce(role, '') not in ('球員', '校隊')
  and team_group is not null;

notify pgrst, 'reload schema';

commit;
