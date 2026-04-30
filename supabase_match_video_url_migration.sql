alter table public.matches
  add column if not exists video_url text;

comment on column public.matches.video_url is '比賽影片連結，例如 YouTube URL。';

notify pgrst, 'reload schema';
