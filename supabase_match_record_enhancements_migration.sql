alter table public.matches
  add column if not exists current_lineup jsonb not null default '[]'::jsonb,
  add column if not exists pitching_stats jsonb not null default '[]'::jsonb,
  add column if not exists current_batter_name text,
  add column if not exists current_inning text default '一上',
  add column if not exists current_b integer not null default 0,
  add column if not exists current_s integer not null default 0,
  add column if not exists current_o integer not null default 0,
  add column if not exists base_1 boolean not null default false,
  add column if not exists base_2 boolean not null default false,
  add column if not exists base_3 boolean not null default false,
  add column if not exists bat_first boolean not null default true,
  add column if not exists show_lineup_intro boolean not null default false,
  add column if not exists show_line_score boolean not null default false,
  add column if not exists show_3d_field boolean not null default false,
  add column if not exists line_score_data jsonb not null default '{"innings":[{"home":"","opponent":""},{"home":"","opponent":""},{"home":"","opponent":""},{"home":"","opponent":""},{"home":"","opponent":""},{"home":"","opponent":""},{"home":"","opponent":""},{"home":"","opponent":""},{"home":"","opponent":""}],"home_h":0,"home_e":0,"opponent_h":0,"opponent_e":0}'::jsonb,
  add column if not exists locked_by_user_id uuid,
  add column if not exists locked_by_user_name text,
  add column if not exists locked_at timestamptz;

notify pgrst, 'reload schema';
