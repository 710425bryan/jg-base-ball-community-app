begin;

comment on column public.team_members.team_group
is '所屬群組 (熊隊)';

update public.team_members
set team_group = case team_group
  when '泰迪熊(小組)' then '拉拉熊(小組)'
  when '灰熊(大組)' then '暴力熊(大組)'
  when '黑熊(中組)' then '成灰熊(中組)'
  else team_group
end
where team_group in (
  '泰迪熊(小組)',
  '灰熊(大組)',
  '黑熊(中組)'
);

notify pgrst, 'reload schema';

commit;
