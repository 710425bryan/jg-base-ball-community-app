begin;

-- Quarterly billing determines the recipients. This key selects the shared
-- training calendar already used by QuarterlyFeeCompensationPanel; it does not
-- restrict recipients to a school team or change any monthly billing rules.
-- Patch only the date calculation in the deployed RPC to preserve subsequent
-- member-ownership, authorization and financial-history fixes.
do $migration$
declare
  definition text;
  patch record;
  old_text text;
  new_text text;
  old_count integer;
  new_count integer;
begin
  definition := replace(pg_get_functiondef('public.upsert_quarterly_fee_compensation_drafts(text,date)'::regprocedure), E'\r\n', E'\n');
  for patch in select * from (values
    (
      $old$  v_baseline_dates date[] := public.get_default_training_month_dates(date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Taipei')::date))::date);
  v_configured_dates date[] := '{}'::date[];
  v_has_setting boolean := false;$old$,
      $new$  v_configured_dates date[] := '{}'::date[]; -- quarterly calendar dates$new$
    ),
    (
      $old$  v_baseline_count := cardinality(coalesce(v_baseline_dates, '{}'::date[]));

  select exists (
    select 1
    from public.training_month_date_settings settings
    where settings.month_start = v_month_start
  )
  into v_has_setting;

  if v_has_setting then
    select coalesce(array_agg(distinct training_date order by training_date), '{}'::date[])
    into v_configured_dates
    from public.training_month_date_settings settings
    cross join lateral unnest(coalesce(settings.training_dates, '{}'::date[])) as training_day(training_date)
    where settings.month_start = v_month_start
      and date_trunc('month', training_date)::date = v_month_start;
  else
    v_configured_dates := coalesce(v_baseline_dates, '{}'::date[]);
  end if;

  v_configured_count := cardinality(coalesce(v_configured_dates, '{}'::date[]));$old$,
      $new$  -- The quarterly baseline is always the number of Saturdays in the month.
  select count(*)::integer
  into v_baseline_count
  from generate_series(
    v_month_start::timestamp,
    v_month_start::timestamp + interval '1 month - 1 day',
    interval '1 day'
  ) as baseline(training_date)
  where extract(dow from training_date) = 6;

  -- Use exactly the calendar and default-date fallback read by the fee panel.
  -- Makeup sessions may fall on any weekday; unrelated calendars cannot fill
  -- a quarterly shortfall. No current-month gate: future drafts are allowed.
  select coalesce(array_agg(distinct training_date::date order by training_date::date), '{}'::date[])
  into v_configured_dates
  from jsonb_array_elements_text(
    public.get_training_month_dates(v_month_start, 'chunggang_school_team')->'training_dates'
  ) as configured(training_date)
  where date_trunc('month', training_date::date)::date = v_month_start;

  v_configured_count := cardinality(coalesce(v_configured_dates, '{}'::date[]));$new$
    )
  ) as patches(old_text, new_text)
  loop
    old_text := replace(patch.old_text, E'\r\n', E'\n');
    new_text := replace(patch.new_text, E'\r\n', E'\n');
    old_count := (length(definition) - length(replace(definition, old_text, ''))) / length(old_text);
    new_count := (length(definition) - length(replace(definition, new_text, ''))) / length(new_text);
    if old_count = 1 and new_count = 0 then
      definition := replace(definition, old_text, new_text);
    elsif old_count = 0 and new_count = 1 then
      continue;
    else
      raise exception 'Quarterly compensation date patch mismatch (% old, % new)', old_count, new_count;
    end if;
  end loop;
  execute definition;
end;
$migration$;

commit;
