begin;

do $prerequisites$
begin
  if to_regprocedure('public.save_coach_leave_request(jsonb,boolean,uuid)') is null
    or to_regprocedure('private.assert_coach_leave_permission(text,boolean,uuid)') is null
    or to_regprocedure('public.get_training_month_dates(date,text)') is null then
    raise exception using errcode='55000',
      message='教練請假批次新增所需的請假核心或訓練項目日期功能尚未完整套用。';
  end if;
end;
$prerequisites$;

-- Receipts are private: request payloads include the optional leave reason.
create table private.coach_leave_create_batches (
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  batch_id uuid not null,
  request_payload jsonb not null,
  leave_ids uuid[] not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_profile_id,batch_id)
);
alter table private.coach_leave_create_batches enable row level security;
revoke all on private.coach_leave_create_batches from public,anon,authenticated;

create or replace function public.create_coach_leave_requests(
  p_leaves jsonb,
  p_manage boolean default false,
  p_batch_id uuid default null
)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := auth.uid();
  v_manage boolean := coalesce(p_manage,false);
  v_item jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_request jsonb;
  v_previous private.coach_leave_create_batches%rowtype;
  v_coach uuid;
  v_batch_coach uuid;
  v_start date;
  v_end date;
  v_segment text;
  v_reason text;
  v_count integer;
  v_unique_count integer;
  v_ids uuid[] := '{}'::uuid[];
begin
  -- Match the existing save and schedule source lock order. The outer call is
  -- one transaction; errors from any inner save roll back every earlier save.
  perform pg_catalog.pg_advisory_xact_lock(20360924,1);
  perform private.assert_active_coach_user();
  if p_batch_id is null then
    raise exception using errcode='22023',message='請提供批次送出識別碼。';
  end if;
  if jsonb_typeof(p_leaves) is distinct from 'array' then
    raise exception using errcode='22023',message='請提供有效的請假資料清單。';
  end if;
  if jsonb_array_length(p_leaves) not between 1 and 365 then
    raise exception using errcode='22023',message='每批請假必須包含1至365筆資料。';
  end if;

  for v_item in select value from jsonb_array_elements(p_leaves)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode='22023',message='每筆請假資料必須是有效物件。';
    end if;
    if nullif(v_item->>'id','') is not null or nullif(v_item->>'updated_at','') is not null then
      raise exception using errcode='22023',message='批次送出只允許新增假單。';
    end if;
    v_coach := case when v_manage then nullif(v_item->>'coach_profile_id','')::uuid else v_actor end;
    perform private.assert_coach_leave_permission('CREATE',v_manage,v_coach);
    if not v_manage and nullif(v_item->>'coach_profile_id','') is not null
      and (v_item->>'coach_profile_id')::uuid <> v_actor then
      raise exception using errcode='42501',message='只能建立本人教練假單。';
    end if;
    -- Check current eligibility before reading a successful receipt as well.
    if not private.coach_profile_is_schedulable(v_coach) then
      raise exception '教練帳號已停用或不符合排班資格。';
    end if;
    if v_batch_coach is not null and v_batch_coach <> v_coach then
      raise exception using errcode='22023',message='每批請假只能選擇一位教練。';
    end if;
    v_batch_coach := v_coach;
    v_start := nullif(v_item->>'start_date','')::date;
    v_end := nullif(v_item->>'end_date','')::date;
    v_segment := coalesce(nullif(v_item->>'time_segment',''),'full_day');
    v_reason := nullif(btrim(v_item->>'reason'),'');
    v_normalized := v_normalized || jsonb_build_array(jsonb_build_object(
      'coach_profile_id',v_coach,'start_date',v_start,'end_date',v_end,
      'time_segment',v_segment,'reason',v_reason
    ));
  end loop;
  select count(*)::integer,
    count(distinct (value->>'start_date',value->>'end_date',value->>'time_segment'))::integer
    into v_count,v_unique_count from jsonb_array_elements(v_normalized);
  if v_count <> v_unique_count then
    raise exception using errcode='22023',message='請假清單包含重複日期與時段。';
  end if;
  select jsonb_agg(value order by value->>'start_date',value->>'end_date',value->>'time_segment')
    into v_normalized from jsonb_array_elements(v_normalized);
  v_request := jsonb_build_object('manage',v_manage,'leaves',v_normalized);
  select * into v_previous from private.coach_leave_create_batches
    where actor_profile_id=v_actor and batch_id=p_batch_id for update;
  if found then
    if v_previous.request_payload <> v_request then
      raise exception using errcode='22023',message='重複送出識別碼已使用，請重新填寫。';
    end if;
    -- Return original IDs even if a leave was later edited or cancelled.
    -- Retrying creation must never restore removed assignments or leave state.
    return v_previous.leave_ids;
  end if;
  for v_item in select value from jsonb_array_elements(v_normalized)
  loop
    v_ids := array_append(v_ids,public.save_coach_leave_request(v_item,v_manage,null));
  end loop;
  insert into private.coach_leave_create_batches(actor_profile_id,batch_id,request_payload,leave_ids)
    values(v_actor,p_batch_id,v_request,v_ids);
  return v_ids;
end;
$$;

create or replace function public.list_coach_leave_training_dates(
  p_month date default null,
  p_manage boolean default false
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_manage boolean := coalesce(p_manage,false);
  v_month date := date_trunc('month',coalesce(p_month,(now() at time zone 'Asia/Taipei')::date))::date;
  v_program record;
  v_payload jsonb;
  v_dates jsonb;
  v_programs jsonb := '[]'::jsonb;
begin
  perform private.assert_coach_leave_permission('VIEW',v_manage,case when v_manage then null else auth.uid() end);
  for v_program in select program_key,label from public.training_program_settings
    where is_active order by sort_order,program_key
  loop
    v_payload := public.get_training_month_dates(v_month,v_program.program_key);
    select coalesce(jsonb_agg(d.day order by d.day),'[]'::jsonb) into v_dates
      from (select distinct value::date as day
        from jsonb_array_elements_text(v_payload->'training_dates')
        where date_trunc('month',value::date)::date=v_month) d;
    -- Deliberately omit notes, source configuration, and member/profile data.
    v_programs := v_programs || jsonb_build_array(jsonb_build_object(
      'program_key',v_program.program_key,'program_label',v_program.label,'training_dates',v_dates
    ));
  end loop;
  return jsonb_build_object('month_start',v_month,'programs',v_programs);
end;
$$;

revoke all on function public.create_coach_leave_requests(jsonb,boolean,uuid),
  public.list_coach_leave_training_dates(date,boolean) from public,anon;
grant execute on function public.create_coach_leave_requests(jsonb,boolean,uuid),
  public.list_coach_leave_training_dates(date,boolean) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
